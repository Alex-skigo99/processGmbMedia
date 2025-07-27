const axios = require("axios");
const Constants = require("../Constants/Constants");

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

module.exports = Utils;
