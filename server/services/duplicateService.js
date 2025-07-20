// server/services/duplicateService.js
const { emit, eventTypes } = require('../websocket/realTimeUpdates');

/**
 * Check if two photo metadata objects are duplicates based on time and GPS.
 * @param {import('../models/photoModel').PhotoMetadata} photo1
 * @param {import('../models/photoModel').PhotoMetadata} photo2
 */
function areDuplicates(photo1, photo2) {
  const timeDiff = Math.abs(photo1.timestamp - photo2.timestamp); // milliseconds
  const latDiff = Math.abs(photo1.gpsLatitude - photo2.gpsLatitude);
  const lngDiff = Math.abs(photo1.gpsLongitude - photo2.gpsLongitude);
  return timeDiff <= 2000 && latDiff <= 0.0001 && lngDiff <= 0.0001;
}

/**
 * Group duplicates within provided photos array.
 * Mutates each photo object by assigning duplicateGroup.
 * @param {Array<import('../models/photoModel').PhotoMetadata>} photos
 * @returns {Array<Array<import('../models/photoModel').PhotoMetadata>>} grouped duplicates
 */
function detectDuplicates(photos) {
  let groupId = 1;
  const groups = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (photo.duplicateGroup) continue; // already grouped

    const group = [photo];
    photo.duplicateGroup = groupId;

    for (let j = i + 1; j < photos.length; j++) {
      const candidate = photos[j];
      if (!candidate.duplicateGroup && areDuplicates(photo, candidate)) {
        candidate.duplicateGroup = groupId;
        group.push(candidate);
      }
    }

    if (group.length > 1) {
      groups.push(group);
      emit(eventTypes.DUPLICATE_FOUND, {
        groupId,
        photos: group.map(p => p.filename)
      });
    }

    groupId += 1;
  }

  return groups;
}

module.exports = {
  areDuplicates,
  detectDuplicates
};