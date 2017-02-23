var test = require('tape')
var fs   = require('fs')
var src  = fs.readFileSync(
  __dirname + '/test-fixture.js', 'utf8'
)

function getAST() {
  return require('./')(src)
}

test('no keys', function(t) {
  var processed = getAST()('inline', function(node) {
    return { type: 'Literal', value: 'replacement' }
  }).code()
    .split('\n')

  onlyChangedOnLine(t, 4, src.split('\n'), processed)
  t.ok(/replacement/g.test(processed[4]))
  t.end()
})

function onlyChangedOnLine(t, safe, before, after) {
  after.forEach(function(line, i) {
    if (safe === i) return
    t.equal(line, after[i])
  })
}

test('one key', function(t) {
  var processed = getAST()(['fs', 'readFileSync'], function(node) {
    return { type: 'Literal', value: 'replacement' }
  }).code()
    .split('\n')

  onlyChangedOnLine(t, 7, src.split('\n'), processed)
  t.ok(/replacement/g.test(processed[7]))
  t.end()
})

test('two keys', function(t) {
  var processed = getAST()(['nested', 'three', 'names'], function(node) {
    return { type: 'Literal', value: 'replacement' }
  }).code()
    .split('\n')

  onlyChangedOnLine(t, 11, src.split('\n'), processed)
  t.ok(/replacement/g.test(processed[11]))
  t.end()
})
