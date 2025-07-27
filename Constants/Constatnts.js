class Constants {
    static getGmbMediaUrl(accountId, locationId, pageToken) {
      return pageToken
        ? `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/media?pageToken=${pageToken}`
        : `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/media`;
    }
  }
  
module.exports = Constants;
