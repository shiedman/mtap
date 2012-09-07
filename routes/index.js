
/*
 * GET home page.
 */

exports.index = function(req, res){
    console.log("req's url:",req.url);
  res.render('index', { title: 'Express' });
};
