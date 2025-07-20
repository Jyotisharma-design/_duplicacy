// server/utils/exifParser.js
const ExifParser = require('exif-parser');

/**
 * Parse EXIF data from image buffer and return metadata.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {import('../models/photoModel').PhotoMetadata}
 */
function parseMetadata(buffer, filename) {
  const parser = ExifParser.create(buffer);
  const result = parser.parse();

  const {
    DateTimeOriginal,
    CreateDate,
    ModifyDate,
    GPSLatitude,
    GPSLongitude,
    ImageWidth,
    ImageHeight,
    Make,
    Model
  } = result.tags;

  const timestampString = DateTimeOriginal || CreateDate || ModifyDate;
  let timestamp = null;
  if (timestampString) {
    // exif-parser returns unix time in seconds
    timestamp = new Date(timestampString * 1000);
  }

  return {
    filename,
    timestamp,
    gpsLatitude: GPSLatitude || null,
    gpsLongitude: GPSLongitude || null,
    fileSize: buffer.length,
    dimensions: { width: ImageWidth, height: ImageHeight },
    cameraInfo: { make: Make, model: Model },
    duplicateGroup: null
  };
}

module.exports = {
  parseMetadata
};