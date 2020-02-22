const acorn = require('acorn');
const escodegen = require('escodegen');

const cliHighlight = require('cli-highlight').highlight;
exports.highlight = (code) => cliHighlight(code, {language: 'javascript', ignoreIllegals: true});

exports.ExtendedError = class ExtendedError extends Error {
  constructor(name, message, ...args /*, context */) {
    let context = {};
    if (typeof args[args.length-1] !== 'string') {
      context = args.pop();
    }
    let description = args.join('\n');
    super([
      message,
      ...(description ? [`\nDetails: ${description}`] : []),
      `\nContext: ${JSON.stringify(context)}`,
    ].join('\n'));
    this.name = name;
    this.context = context;
  }
}

exports.cloneAst = (ast) => {
  return acorn.parse('var a = '+escodegen.generate(ast), {}).body[0].declarations[0].init;
}


exports.parseBundleModules = function parseBundleModules(node, bundle, isChunk=false) {
  if (node.type === 'ObjectExpression') {
    // Object
    return node.properties.map(property => {
      const key = typeof property.key.value !== 'undefined' ? property.key.value : property.key.name;
      return [
        key,
        property.value,
      ];
    })
  } else if (node.type === 'ArrayExpression') {
    // Array
    return node.elements.map((moduleAst, moduleId) => [moduleId, moduleAst])
  } else {
    throw new ExtendedError('BundleModuleParsingError',
      'Cannot locate modules within bundle - it is not an array or an object!',
      'The module bootstrapping function was found and parsed, but no array or object',
      'containing module closures was found. This probably means that the module being parsed',
      'is something a bit unusual, and in order to unpack this bundle, a manual path to the',
      'module array must be specified by adding a "moduleClosurePath" key to the "options" object',
      `in the ${bundle.metadataFilePath} file that was created. For more information, see [INSERT LINK HERE].`,
      {foo: true}
    );
  }
}
