/**
 * Static site build controller
 * Generates a static HTML site with all markdown documents
 */

const { generateStaticSite } = require('../services/static-builder');

/**
 * Build static site as ZIP
 * POST /api/build-static
 */
async function buildStaticSite(req, res, next) {
  try {
    const { config, logger } = req.app.locals;

    logger.info('Static build started');

    // Generate static site ZIP
    const archive = await generateStaticSite(config, logger);

    // Set response headers
    res.attachment('doclight-static.zip');
    res.setHeader('Content-Type', 'application/zip');

    // Pipe archive to response
    archive.pipe(res);

    // Log completion when archive finishes
    archive.on('end', () => {
      logger.info('Static build completed', {
        bytes: archive.pointer()
      });
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { buildStaticSite };
