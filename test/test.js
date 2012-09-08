filename=new Buffer('[r-k6745987]灼眼のシャナⅢ 1-12[lv.1].part01.rar').toString('binary');
filename=filename.replace(/[";\s]+$/,'');
    try{
        var buf= new Buffer(filename,'binary');
        throw('dddd');
    }catch(err){
        console.error(err);
        filename=buf.toString();
    }
console.log(filename);
