var nested = require('./bogus')
var inline = require('./bogus')
var fs = require('fs')

inline('here is some content')
inline.nested('should not get inlined')

fs.readFileSync(__filename, 'utf8')
fs.createReadStream(__dirname + '/test.js')

nested.two.keys()
nested.three.names()
nested.one()
