var recast   = require('recast')
var traverse = recast.types.traverse
var build    = recast.types.builders
var parse    = recast.parse
var print    = recast.print

module.exports = replacer

function replacer(ast) {
  if (Buffer.isBuffer(ast)) ast = String(ast)
  if (typeof ast === 'string')
    ast = parse(ast)

  replace.code = code
  replace.replace = replace

  return replace

  function code() {
    return print(ast).code
  }

  function replace(methodPath, updater) {
    methodPath = Array.isArray(methodPath)
      ?  methodPath
      : [methodPath]

    var size = methodPath.length

    traverse(ast, size === 1
      ? single
      : nested
    )

    return replace

    function single(node) {
      if (node.type !== 'CallExpression') return
      if (node.callee.type !== 'Identifier') return
      if (methodPath[0] !== node.callee.name) return

      var result = updater(node)
      if (result !== undefined) {
        this.replace(result)
        return false
      }
    }

    function nested(node) {
      if (node.type !== 'CallExpression') return

      var c = node.callee
      var o = node.callee
      var i = size - 1

      if (c.type === 'Identifier') return
      while (c && c.type === 'MemberExpression') {
        o = c
        if (c.computed) return
        if (methodPath[i] !== c.property.name) return
        c = c.object
        i = i - 1
      }

      if (!o.object || !o.object.name) return
      if (o.object.name !== methodPath[0]) return

      var result = updater(node)
      if (result !== undefined) {
        this.replace(result)
        return false
      }
    }
  }
}
