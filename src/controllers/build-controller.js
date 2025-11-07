/**
 * Static site build controller
 * Generates a static HTML site with all markdown documents
 */

const fs = require('fs');
const {
  generateStaticSite,
  generateContentHash,
  getCachedBuild,
  saveBuildToCache
} = require('../services/static-builder');

/**
 * Build static site as ZIP with caching
 * POST /api/build-static
 */
async function buildStaticSite(req, res, next) {
  try {
    const { config, logger } = req.app.locals;

    logger.info('Static build requested');

    // 1. Generate content hash
    const { hash, fileCount, totalSize } = await generateContentHash(config.docsRoot);

    logger.info('Content hash generated', {
      hash: hash.substring(0, 8) + '...',
      fileCount,
      totalSize
    });

    // 2. Check cache
    const cached = await getCachedBuild(hash);

    if (cached.exists) {
      logger.info('Using cached build', {
        hash: hash.substring(0, 8) + '...',
        cachedAt: cached.cachedAt
      });

      // Send cached ZIP
      res.attachment('doclight-static.zip');
      res.setHeader('Content-Type', 'application/zip');

      const fileStream = fs.createReadStream(cached.zipPath);
      fileStream.pipe(res);

      return;
    }

    // 3. Build new static site
    logger.info('Building new static site');

    const archive = await generateStaticSite(config, logger);

    // 4. Buffer to memory for caching
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      archive.on('end', resolve);
      archive.on('error', reject);
    });

    const zipBuffer = Buffer.concat(chunks);

    // 5. Save to cache
    await saveBuildToCache(hash, zipBuffer);

    logger.info('Static build cached', {
      hash: hash.substring(0, 8) + '...',
      size: zipBuffer.length
    });

    // 6. Send to client
    res.attachment('doclight-static.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.send(zipBuffer);

  } catch (error) {
    logger.error('Static build failed', { error: error.message });
    next(error);
  }
}

module.exports = { buildStaticSite };
