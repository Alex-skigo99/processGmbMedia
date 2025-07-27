const axios = require("axios");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const knex = require("/opt/nodejs/db");
const DatabaseTableConstants = require("/opt/nodejs/DatabaseTableConstants");
const FetchGoogleTokensUtils = require("/opt/nodejs/FetchGoogleTokensUtils");
const Utils = require("./Utils/Utils");
const { Upload } = require("@aws-sdk/lib-storage");

const s3 = new S3Client({});
const BUCKET = "renew-local-gmb-location-media";

exports.handler = async (event) => {
  console.log("Got an event!");
  console.log(event);
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(2);

  const messages = event.Records.map(r => JSON.parse(r.body));

  await Promise.all(messages.map(async (msg) => {
    const { organization_id, account_id, gmb_id, posts_media } = msg;

    const location = await knex(DatabaseTableConstants.GMB_LOCATION_TABLE)
      .where({ id: gmb_id })
      .select("verification_status")
      .first();

    if (!location || location.verification_status !== "VERIFIED") {
      console.log(`⚠️ Skipping ${gmb_id} - Not VERIFIED`);
      return { statusCode: 200, body: '"Skipping GMB, not verified"' };
    }

    try {
      // 1. Get a valid Google access token
      const token = await FetchGoogleTokensUtils
        .fetchValidGoogleAccessTokenViaAccountAndOrgId(account_id, organization_id);

      // 2. Fetch all media items from GMB location
      const allMediaFromGoogle = await Utils.getGmbMedia(account_id, gmb_id, token);

        // 2b. add posts media to the allMedia array
      const allMedia = await Utils.addPostsMedia(gmb_id, allMediaFromGoogle, posts_media);

      // 3. Map into rows matching your gmb_media table
      const rows = allMedia.map(m => ({
        gmb_id:              gmb_id,
        name:                m.name,
        media_format:        m.mediaFormat,
        category:            m.locationAssociation?.category ?? null,
        price_list_item_id:  m.locationAssociation?.priceListItemId ?? null,
        google_url:          m.googleUrl,
        thumbnail_url:       m.thumbnailUrl,
        create_time:         m.createTime,
        // backed_up_time will default to now()
        width_px:            m.dimensions?.widthPixels ?? null,
        height_px:           m.dimensions?.heightPixels ?? null,
        view_count:          m.insights?.viewCount ?? null,
        attribution_json:    m.attribution || null,
        description:         m.description || null,
        source_url:          m.sourceUrl || null,
        data_ref_resource:   m.dataRef?.resourceName || null
      }));

      // 3a. fetch existing media names for this gmb_id
      const existingNames = await knex(DatabaseTableConstants.GMB_MEDIA_TABLE)
        .where({ gmb_id })
        .pluck('name');

      // 3b. filter out rows whose name is already in the DB
      const newRows = rows.filter(r => !existingNames.includes(r.name));

      if (newRows.length === 0) {
        console.log(`🚫 No new media for ${gmb_id}, skipping insert & S3 upload.`);
        return;
      }

      // 4. Upsert into Postgres, returning id & google_url for S3 step
      const inserted = await knex(DatabaseTableConstants.GMB_MEDIA_TABLE)
        .insert(newRows)
        .returning(['id', 'google_url']);

      //4b. Check and mark posts media
      await Utils.checkAndMarkPostsMedia(gmb_id, allMedia, posts_media);

      // 5. Download and push each to S3
      await Promise.all(
        inserted.map(row => limit(async () => {
          if (!row.google_url) return;
          const response = await axios.get(row.google_url, { responseType: 'stream' });
          // stream directly into S3 via multipart uploader
          await new Upload({
            client:    s3,
            params: {
              Bucket:      BUCKET,
              Key:         `${gmb_id}/${row.id}`,
              Body:        response.data,
              ContentType: response.headers['content-type'] || "application/octet-stream",
            }
          }).done();
        }))
      );
    } catch (err) {
      console.error(`Failed processing media for GMB ${msg.gmb_id}:`, err);
      throw err;  // bubble to SQS/DLQ
    }
  }));

  return { statusCode: 200, body: '"OK"' };
};
