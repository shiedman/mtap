/** 
 * simplify version of inireader(https://github.com/Ajnasz/IniReader)
 * just truncate unneeded functions
 */
var fs=require('fs'),
    util=require('util');

/**
 * @method getLe
 * @param {String} [le] Predefined line ending character. Only "\n", "\r" and
 * "\r\n" are valid values!
 * @return {String} The line ending character or characters. Default is "\n"
 */
function getLe(le) {
    return typeof le === 'string' && (le === '\n' || le === '\r\n' || le === '\r') ? le : '\r\n';
}
var groupReg = /^\s*\[\s*([^\]]+)\s*\]/;
function parseBlock(block,section) {
    var m=block.match(groupReg);
    //comment? skip
    if(!m){ return; }
    var group=m[1];
    if(group=='xunlei'){ group='f.xunlei.com'; }
    if(group=='vdisk'){ group='vdisk.weibo.com'; }
    var s=block.substring(m.index+m[0].length);
    var value={},empty=true;
    for(var lines=s.split(/\r\n|\r|\n/),i=0;i<lines.length;i++){
        var params=lines[i].split('=');
        if(params.length==2){
            var key=params[0].trim();
            if(key[0]!=';'){
                value[key]=params[1].trim();
                empty=false;
            }
        }
    }
    //if(group in this.section){
    if(!section.hasOwnProperty(group)){
        section[group]=value;
    }else if(!empty){
        if(Array.isArray(section[group])){
            section[group].push(value);
        }else{
            section[group]=[section[group],value];
        }
    }
    
}

function IniConfig(file) {
    this.file = file || null;
    this.section={};
    this.writed=0;
}
IniConfig.prototype.parse = function (data,section) {
    section=section||this.section;
    for(var i=0,j=0,len=data.length;j<len;j++){
        if(data[j]=='['){
            parseBlock(data.substring(i,j),section);
            i=j;
        }
    }
    parseBlock(data.substring(i),section);
    return section;
};
/**
 * Loads a ini file
 * @method load
 * @param String file
 **/
IniConfig.prototype.load = IniConfig.prototype.init = function load(file) {
    if (typeof file === 'string') { this.file = file; }
    if (!this.file) { throw new Error('No file name given'); }
    try {
        var data=fs.readFileSync(this.file, 'utf-8');
        this.section={};
        this.parse(data);
        console.log('%s - [iniconfig]loaded: %s',datetime(),this.file);
    } catch (e) {
        console.error(e);
    }
};

/**
 * Write ini file to the disk
 * @method write
 * @param {String} [file] File name
 * @param {String} [le] Line ending string
 */
IniConfig.prototype.write = function (file, le) {
    if (!file) {
        file = this.file;
        this.writed++;
        //console.log('%s - [iniconfig]writed: %s',datetime(),file);
    }

    // get line break
    le = getLe(le);

     // create a headline
    var output = '; IniConfig' + le + '; ' +datetime()+le;

    output += this.serialize(le);

    fs.writeFileSync(file, output);
};
/**
 * Converts the currently loaded configuration to a INI file.
 * @method serialize
 * @param {String} [le] Predefined line ending character
 * @return {String} Currently loaded configuration as a INI file content which
 * could be written directly into a file
 */
IniConfig.prototype.serialize = function serialize(le) {
    var output = '', values = this.section;

    le = getLe(le);

    for(var group in values){
        var groupValues = values[group];
        if(!Array.isArray(groupValues))groupValues=[groupValues];

        for(var i=0;i<groupValues.length;i++){
            output += le + '[' + group + ']' + le;
            for(var key in groupValues[i]){
                var value=groupValues[i][key];
                output += key + '=' + value + le;
            }
        }

    }

    return output;
};

IniConfig.prototype.param = function(group,prop,value) {
    var values= this.section[group];
    if(!Array.isArray(values))return values||{};
    if(!prop)return values||{};
    for(var i=0;i<values.length;i++){
        var d=values[i];
        if(d.hasOwnProperty(prop)){
            if(value==undefined){
                return d;
            }else if(d[prop]==value){
                return d;
            }
        }
    }
    return {};
};
IniConfig.prototype.toText = function () {
    var values=this.section;
    var rs='';

    var show=true;
    show=false;
    if(show){
    var _9gal=values['9gal'];
    var name=_9gal['user']||'';
    var pass=_9gal['pass']||'';
    rs+='\n;bbs.9gal.com\n';
    rs+=';说明：广告/KFB\n';
    rs+='[9gal]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    }

    var _xunlei=values['xunlei'];
    var name=_xunlei['user']||'';
    var pass=_xunlei['pass']||'';
    rs+='\n;f.xunlei.com\n';
    rs+=';说明:迅雷方舟登录帐号，用于上传服务器文件到方舟\n';
    rs+='[xunlei]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    
    var _vdisk=values['vdisk'];
    var name=_vdisk['user']||'';
    var pass=_vdisk['pass']||'';
    rs+='\n;vdisk.weibo.com\n';
    rs+=';说明:上传文件至新浪微盘\n';
    rs+='[vdisk]\n';
    rs+=util.format('username=%s\npassword=%s\n',name,pass);
    return rs;
};

exports.IniConfig = IniConfig;

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
function _2n(n){return ('0'+n).slice(-2);}
function datetime(){
    //var d=new Date(Date.now()+28800000);//+8 hours
    var d=new Date();//+8 hours
    return d.getFullYear()+'-'+_2n(d.getMonth()+1)+'-'+_2n(d.getDate())+' '+_2n(d.getHours())+':'+_2n(d.getMinutes())+':'+_2n(d.getSeconds());
}
