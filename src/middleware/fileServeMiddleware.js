const path = require("path");
const fs = require("fs");

const handleFileServing = (req, res, next) => {
  const handleError = (err) => {
    if (err) {
      console.error("File serving error:", {
        path: req.path,
        error: err.message,
        code: err.code,
      });

      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }

      return res.status(500).json({ error: "Error serving file" });
    }
  };

  // Handle range requests for videos and PDFs
  const handleRangeRequest = (filePath, stats) => {
    const range = req.headers.range;
    if (!range) {
      return false;
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
    const chunkSize = (end - start) + 1;

    console.log('Handling range request:', { start, end, chunkSize });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': req.path.endsWith('.mp4') ? 'video/mp4' : 'application/pdf',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Origin, X-Requested-With, Content-Type, Accept',
      'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:"
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', handleError);
    stream.pipe(res);
    return true;
  };

  // Set security and CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Origin, X-Requested-With, Content-Type, Accept");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:");

  // Enhanced file serving for PDFs and videos
  if (req.path.endsWith('.mp4') || req.path.endsWith('.pdf')) {
    const filePath = path.join(__dirname, '../..', req.path.replace('/api', ''));
    
    fs.stat(filePath, (err, stats) => {
      if (err) {
        return handleError(err);
      }

      // Handle range requests if present
      if (req.headers.range && handleRangeRequest(filePath, stats)) {
        return;
      }

      // Set headers for full file response
      const contentType = req.path.endsWith('.mp4') ? 'video/mp4' : 'application/pdf';
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Content-Disposition", "inline");

      // Stream the file
      const stream = fs.createReadStream(filePath);
      stream.on('error', handleError);
      stream.pipe(res);
    });
    return;
  }

  next();
};

module.exports = handleFileServing;
