const axios = require("axios");
const Constants = require("../Constants/Constants");
const knex = require("/opt/nodejs/db");
const DatabaseTableConstants = require("/opt/nodejs/DatabaseTableConstants");

class Utils {
  static getGmbMedia = async (accountId, locationId, googleAccessToken) => {
    const allGmbMedia = [];
    let pageToken   = null;

    do {
      const gmbMediaUrl = Constants.getGmbMediaUrl(accountId, locationId, pageToken);

      const { data } = await axios.get(gmbMediaUrl, {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      });

      if (data?.mediaItems?.length) {
        allGmbMedia.push(...data.mediaItems);
      }

      pageToken = data?.nextPageToken || null;
    } while (pageToken);

    return allGmbMedia;
  };

  // Adds posts media to the allMedia array
  // If a media item already exists, it updates the post_id
  // If it doesn't exist, it adds a new media item with post_id
  static addPostsMedia = (gmb_id, allMedia, posts_media) => {
    if (!posts_media) return allMedia;

    posts_media.forEach(post => {
        const media = post.media;
        media.forEach(media_item => {
            const existingMedia = allMedia.find(m => m.name === media_item.name);

            if (existingMedia) {
                existingMedia.post_id = post.post_id;
                console.log(`✅ Updated post_id in AllMedia for media: ${media_item.name}`);

            } else {
                allMedia.push({
                    gmb_id: gmb_id,
                    post_id: post.post_id,
                    ...media_item
                });
                console.log(`✅ Added new media to AllMedia: ${media_item.name}`);
            }
        });
        return allMedia;
    });
  };

  static checkAndMarkPostsMedia = async (gmb_id, allMedia, posts_media) => {
    if (!posts_media) return;

    const updateData = [];

    posts_media.forEach(post => {
      if (post.media) {
        post.media.forEach(media_item => {
          // Find matching media in allMedia by name
          const matchingMedia = allMedia.find(m => m.name === media_item.name);
          
          if (matchingMedia) {
            updateData.push({
              gmb_id: gmb_id,
              name: media_item.name,
              post_id: post.post_id
            });
          }
        });
      }
    });

    // If there's data to update, perform the database updates
    if (updateData.length > 0) {
      console.log(`🔄 Updating ${updateData.length} media items with post_id for GMB ID: ${gmb_id}`);
      
      await Promise.all(updateData.map(async (item) => {
        await knex(DatabaseTableConstants.GMB_MEDIA_TABLE)
          .where({ gmb_id: item.gmb_id, name: item.name })
          .update({ post_id: item.post_id });
        
        console.log(`✅ Updated post_id for media: ${item.name}`);
      }));
    } else {
      console.log(`✅ No matching media found to update for GMB ID: ${gmb_id}`);
    }
  };

}

module.exports = Utils;
