
// Functions to generate AST. This would be a function with two require calls inside:
// generateFunction(
//   generateRequire('./foo'),
//   generateRequire('./bar')
// )
//

function generateProgram(...body) {
  return {
    type: 'Program',
    body,
  };
}

function generateFunction(...body) {
  return {
    type: 'FunctionDeclaration',
    defaults: [],
    id: null,
    params: [
      {type: 'Identifier', name: 'module'},
      {type: 'Identifier', name: 'exports'},
      {type: 'Identifier', name: 'require'},
    ],
    body: {
      type: 'BlockStatement',
      body,
    },
  };
}

function generateRequire(requireContents) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'Identifier',
      name: 'require',
    },
    arguments: [{
      type: 'Literal',
      raw: requireContents.toString(),
      value: requireContents,
    }],
  };
}


module.exports = {
  generateFunction,
  generateRequire,
  generateProgram,
};
