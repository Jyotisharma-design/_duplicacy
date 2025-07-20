// server/controllers/duplicateController.js
const { getImagesFromLink } = require('../services/googleDriveService');
const { parseMetadata } = require('../utils/exifParser');
const { detectDuplicates } = require('../services/duplicateService');
const { emit, eventTypes } = require('../websocket/realTimeUpdates');

/**
 * Start analysis given drive link.
 */
async function startAnalysis(driveLink) {
  emit(eventTypes.PROCESSING_STARTED, { driveLink });

  try {
    const imageItems = await getImagesFromLink(driveLink);
    const total = imageItems.length;
    const metadataList = [];

    for (let idx = 0; idx < imageItems.length; idx++) {
      const { buffer, filename } = imageItems[idx];
      const metadata = parseMetadata(buffer, filename);
      metadataList.push(metadata);

      emit(eventTypes.PHOTO_PROCESSED, {
        index: idx + 1,
        total,
        filename,
        metadata
      });
      emit(eventTypes.COUNT_UPDATE, {
        totalProcessed: idx + 1
      });
    }

    // Detect duplicates
    const duplicateGroups = detectDuplicates(metadataList);

    emit(eventTypes.PROCESSING_COMPLETE, {
      total,
      unique: total - duplicateGroups.reduce((acc, g) => acc + g.length - 1, 0),
      duplicates: duplicateGroups.reduce((acc, g) => acc + g.length, 0)
    });
  } catch (error) {
    console.error('Analysis failed:', error);
    emit(eventTypes.ERROR, { message: error.message });
  }
}

module.exports = {
  startAnalysis
};