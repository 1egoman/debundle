exports.DEFAULT_CHUNK = 'default';

exports.DEFAULT_OPTIONS = {
  distPath: './dist',
  chunkFileNameSuffix: '.bundle.js',
  publicPathPrefix: '',
  chunkHttpRequestOptions: {},
  chunkNameMapping: {},
};

exports.METADATA_FILE_TEMPLATE = `// This auto-generated file defines some options used when "<PATH>" is debundled.
module.exports = <JSON>\n`;
