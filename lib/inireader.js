/** 
 * simplify version of inireader 
 * shiedman@gmail.com
 */

/*jslint node: true, sloppy: true, es5: true */
// regular expressions to clear, validate and get the values
/*jslint regexp: true */
/**
 * Regular expression to find lines which shouldn't be parsed
 * @property skipLineRex
 * @final
 * @private
 */
var skipLineRex = /^\s*(\n|\#|;)/,
    /**
     * Regular expression to remove white space chars from the beginning and end of
     * a line
     * @property chompRex
     * @final
     * @private
     */
    chompRex = /(?:\n|\r)$/,
    /**
     * Regular expression to find non whitespace characters
     * @property nonWhitespaceRex
     * @final
     * @private
     */
    nonWhitespaceRex = /\S/,
    /**
     * Regular expression to find key/value pairs in a line
     * @property keyValueRex
     * @final
     * @private
     */
    keyValueRex = /^\s*([^=]*\w)\s*=\s*(.*)\s*$/,
    /**
     * Regular expression to find group entry marker in an ini file
     * @property groupRex
     * @final
     * @private
     */
    groupRex = /^\s*\[\s*([^\]]+)\s*\]$/;

/*jslint regexp: false*/

/**
 * Reads a file and returns it's lines as an array
 * @method getLines
 * @param {String} file File name to load and parse
 * @param {Function} cb Callback function to call when parse finished
 * @param {Boolean} async Use synchronous or asynchronous file operations
 * @private
 * @return {Array} Lines of the file
 */
var getLines = function (file, cb) {
    var fs = require('fs'), splitLines, data;
    splitLines = function (data) {
        data = data.toString();
        var lines;
        if (data.indexOf('\r\n') > -1) {
            lines = data.split('\r\n');
        } else if (data.indexOf('\n') > -1) {
            lines = data.split('\n');
        } else if (data.indexOf('\r') > -1) {
            lines = data.split('\r');
        } else { // mostly it's only one line
            lines = [data];
        }
        return lines.filter(function emptyLineFilter(line) {
            return line !== '';
        });
    };
    fs.readFile(file, function fileReadCb(err, data) {
        if (err) { throw err; }
        cb(splitLines(data));
    });
};

/**
 * If a string is inside quotes, the quotes will be removed It doesn't care
 * about escaped/not escaped strings. So you can have thing like this:
 * "lorem ipsum" dolor sit"
 * and you will receive:
 * lorem ipsum" dolor sit
 * @method fixQuoted
 * @param {String} str
 * @return {String} String without starting and closing quotes
 * @private
 */
var fixQuoted = function (str) {
    if (
        (str[0] === '"' && str[str.length - 1] === '"') ||
            (str[0] === "'" && str[str.length - 1] === "'")
    ) {
        return str.substr(1, str.length - 2);
    }
    return str;
};

/**
 * Return a deep copy of the object
 * @method deepCopy
 * @param {Object} sourceObj The object which should be copied
 * @param {Object} [destinationObj] The destination object which should have
 * the new properties after copy
 * @return {Object} Object with the new parameters
 * @private
 */
var deepCopy = function (sourceObj, destinationObj) {
    var out = destinationObj || {}, key;
    Object.keys(sourceObj).forEach(function (key) {
        if (typeof sourceObj[key] === 'object') {
            out[key] = (sourceObj[key].constructor === Array ? [] : {});
            deepCopy(sourceObj[key], out[key]);
        } else {
            out[key] = sourceObj[key];
        }
    });

    return out;
};

/**
 * Parses a .ini file and convert's it's content to a JS object
 * Parser regexps are from the Config::Simple Perl module
 * @class IniReader
 * @constructor
 * @module IniReader
 * @main IniReader
 * @extends EventEmitter
 * @param {Object} [cfg] Configuration object. (In older versions it could be a
 * string too, which was the file name to parse, but that behaviour is
 * deprectaed)
 *     @param {Boolean} [cfg.async] If true, it will use asynchronous calls to
 *     read and write files
 *     @param {String} [cfg.file] The file name to read or write during
 *     operations
 * @param {Boolean} [async] (Deprecated) Use the cfg.async instead.
 */
function IniReader(file) {
    this.construct(file);
}
require('util').inherits(IniReader, require('events').EventEmitter);
/**
 * Name of the file.
 * Doing a load method and without specifying it's name directly that property
 * will be used.
 * Doing a write method and without specifying it's name directly that property
 * will be used.
 * @property file
 * @type {String}
 * @default null
 */
/**
 * If true all file operation will be done asynchronously
 * @property async
 * @type {Boolean}
 * @default false
 */
/**
 * Error event emitted every time an error occured
 * @event error
 */
/**
 * Event emitted when a file parse finished
 * @event fileParse
 */
/**
 * Event emitted when the configuration has been written to a file
 * @event fileWritten
 */
/**
 * Initializes the configuration properties
 * @method construct
 * @param {Object} [cfg] Configuration object. (In older versions it could be a
 * string too, which was the file name to parse, but that behaviour is
 * deprectaed)
 *     @param {Boolean} [cfg.async] If true, it will use asynchronous calls to
 *     read and write files
 *     @param {String} [cfg.file] The file name to read or write during
 *     operations
 * @param {Boolean} [async] (Deprecated) Use the cfg.async instead.
 * @constructor
 */
IniReader.prototype.construct = function (file) {
    this.file = file || null;
    //this.values={};
};
/**
 * Loads a ini file
 * @method load
 * @param String file
 **/
IniReader.prototype.load = IniReader.prototype.init = function load(file) {
    if (typeof file === 'string') {
        this.file = file;
    }
    if (!this.file) {
        this.emit('error', new Error('No file name given'));
    }
    try {
        getLines(this.file, function parseLines(lines) {
            this.lines = lines;
            this.values = this.parseFile();
            this.emit('fileParse');
            //console.dir(this);
        }.bind(this), true);
    } catch (e) {
        this.emit('error', e);
    }
};

/**
  * Tries to find a group name in a line
  * @method parseSectionHead
  * @type {String|False}
  * @return {String | False} the group name if found or false
  */
IniReader.prototype.parseSectionHead = function parseSectionHead(line) {
    var groupMatch = line.match(groupRex);
    return groupMatch ? groupMatch[1] : false;
};

/**
  * Tries to find a key/value pair in a line
  * @method keyValueMatch
  * @type {Object|False}
  * @return {Object | False} the key value pair in an object ({key: 'key',
  * value;'value'}) if found or false
  */
IniReader.prototype.keyValueMatch = function keyValMatch(line) {
    var kvMatch = line.match(keyValueRex);
    return kvMatch ? {key: kvMatch[1], value: kvMatch[2]} : false;
};

/**
  * Parses an init file, and extracts blocks with keys and values
  * @method parseFile
  * @return {Object} The configuration tree
  */
IniReader.prototype.parseFile = function parseFile() {

    var output, lines, groupName, keyVal, line, currentSection, lineNumber;

    output = {};
    lines = this.lines;

    lineNumber = 0;

    while (lines.length) {
        line = lines.shift();

        lineNumber += 1;
        // skip comments and empty lines
        if (!skipLineRex.test(line) && nonWhitespaceRex.test(line)) {
            line = line.replace(chompRex, '');
            line = line.trim();

            // block name
            groupName = this.parseSectionHead(line);
            if (groupName) {
                currentSection = groupName;
                if (!output[currentSection]) {
                    output[currentSection] = {};
                }
            } else {
                // key/value pairs
                keyVal = this.keyValueMatch(line);
                if (keyVal) {
                    if (currentSection) {
                        output[currentSection][keyVal.key] = fixQuoted(keyVal.value);
                    } else {
                        // outside of a section
                        this.emit('error', new SyntaxError("Syntax error in line " + lineNumber));
                    }
                } else {
                    // keyVal not found and not commented so something is wrong
                    this.emit('error', new SyntaxError("Syntax error in line " + lineNumber));
                }
            }
        }

    }

    return output;
};
/**
 * Method to get a one property value or a ini block or all of the block of
 * the loaded configuration
 * @method getBlock
 * @return {String | Number | Object | Null | Boolean | Undefiend} The property
 * value
 * @type Object
 * @deprecated
 */
IniReader.prototype.getBlock = function getBlock(block) {
    return this.param(block);
};
/**
  * @method getValue
  * @param String block The name of the block where the key should be defined
  * @param String key The name of the key which value should be returned
  * @return {String | Number | Object | Null | Boolean | Undefiend} the value of the key
  * @deprecated
  */
IniReader.prototype.getValue = function getValue(block, key) {
    var param = block;
    if (typeof key !== 'undefined') {
        param += '.' + key;
    }
    return this.getParam(param);
};

/**
 * Method to get the configuration tree or a configuration block a specific
 * value in a block.
 * @method getParam
 * @param {String} [param] The name of the block where the key should be
 * defined. You can get the whole configuration tree by not setting this
 * argument.
 * You can get a configuration block by passing its name: getParam('fooblock').
 * You can get a specific property by passing its block name with the property
 * name. They should be concatenated with a ".":
 * getParam('fooblock.barproperty').
 * @return {String | Number | Object | Null | Boolean | Undefiend} The property
 * value
 */
IniReader.prototype.getParam = function getParam(param) {
    var output = this.values,
        block,
        key;

    if (param) {
        var _i=param.indexOf('.');
        block=param.substring(0,_i);
        key=param.substring(_i+1);
        //param = param.split('.');
        //block = param[0];
        //key = param[1];

        if (block) {
            output = output[block];

            if (key) {
                output = output[key];
            }
        }else{
            output = output[key];
        }
    }

    return output;
};
/**
 * Sets the parameter in the loaded configuration object.
 * @method setParam
 * @param {String} prop The name of the property which should be set
 * @param {String | Number | Object | Null | Boolean} value The new value of the property
 */
IniReader.prototype.setParam = function setParam(prop, value) {
    if (typeof this.values !== 'object') {
        this.values = {};
    }
    var block,key, ref = this.values;
    if (prop) {
        var _i=prop.indexOf('.');
        block=prop.substring(0,_i);
        key=prop.substring(_i+1);

        if (block) {
            if(!ref[block]){ref[block]={};}
            ref[block][key]=value;
        }else{
            ref[prop]=value;
        }
    }
};
/**
 * Setter and getter method. If only the first parameter defined it will return
 * the value of the parameter. If the second parameter set, it will set the
 * parameter in the loaded configuration object.
 * @method param
 * @param {String} prop The name of the property which should be returned or
 * which should be set
 * @param {String | Number | Object | Null | Boolean} value The new value of the property
 * @return {String | Number | Object | Null | Boolean | Undefiend} The property
 * value if the method was called with one argument or undefined if it was
 * called with two arguments
 */
IniReader.prototype.param = function param(prop, value) {
    var output;
    if (typeof value === 'undefined') {
        output = this.getParam(prop);
    } else {
        output = this.setParam(prop, value);
    }
    return output;
};

/**
 * @method getLe
 * @param {String} [le] Predefined line ending character. Only "\n", "\r" and
 * "\r\n" are valid values!
 * @return {String} The line ending character or characters. Default is "\n"
 */
IniReader.prototype.getLe = function getLe(le) {
    return typeof le === 'string' && (le === '\n' || le === '\r\n' || le === '\r') ? le : '\n';
};

/**
 * Converts the currently loaded configuration to a INI file.
 * @method serialize
 * @param {String} [le] Predefined line ending character
 * @return {String} Currently loaded configuration as a INI file content which
 * could be written directly into a file
 */
IniReader.prototype.serialize = function serialize(le) {
    var output = '',
        ws = /\s+/,
        values = this.values,
        group;

    le = this.getLe(le);

    Object.keys(values).forEach(function serializeGroup(group) {
        output += le + '[' + group + ']' + le;
        var groupValues = values[group];

        Object.keys(groupValues).forEach(function serializeKey(key) {
            var value = groupValues[key];
            if (ws.test(value)) {
                if (value.indexOf('"') > -1) {
                    value = "'" + value + "'";
                } else {
                    value = '"' + value + '"';
                }
            }
            output += key + '=' + value + le;
        }, this);
    }, this);

    return output;
};

/**
 * Write ini file to the disk
 * @method write
 * @param {String} [file] File name
 * @param {String} [le] Line ending string
 */
IniReader.prototype.write = function (file, le) {
    if (!file) {
        file = this.file;
    }

    // get last line
    le = this.getLe(le);

    var now = new Date(),
      // create a headline
        output = '; IniReader' + le + '; ' + now.getFullYear() + '-' +
            (now.getMonth() + 1) + '-' + now.getDate() + le,
        ws = /\s+/,
        fs = require('fs'),
        group,
        item,
        value;

    output += this.serialize(le);

    fs.writeFileSync(file, output);
};


exports.IniReader = IniReader;

