
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

// Generate a function with the parameter names mangled, as if the bundle was minified.
function generateMangledFunction(...body) {
  return {
    type: 'FunctionDeclaration',
    defaults: [],
    id: null,
    params: [
      {type: 'Identifier', name: 'mangledModule'}, // module
      {type: 'Identifier', name: 'mangledExports'}, // exports
      {type: 'Identifier', name: 'mangledRequire'}, // require
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

function generateMangledRequire(requireContents) {
  return {
    type: 'CallExpression',
    callee: {
      type: 'Identifier',
      name: 'mangledRequire',
    },
    arguments: [{
      type: 'Literal',
      raw: requireContents.toString(),
      value: requireContents,
    }],
  };
}

function generateVariableAssignment(variableName, contentIdentifier, assignmentType="const") {
  return {
    "type": "VariableDeclaration",
    "declarations": [
      {
        "type": "VariableDeclarator",
        "id": {
          "type": "Identifier",
          "name": variableName,
        },
        "init": contentIdentifier,
      },
    ],
    "kind": assignmentType,
  };
}


module.exports = {
  generateFunction,
  generateMangledFunction,
  generateRequire,
  generateMangledRequire,
  generateProgram,
  generateVariableAssignment,
};
