/*global module,require*/
var express = require('express');
var router = express.Router();
var jsen = require('jsen');
var Mock = require('mockjs');
var monk = require('monk');
var request = require('superagent');
var _ = require('underscore');
var mock = require('superagent-mocker')(request);
var db = monk('localhost:27017/api');
var fs = require('fs');
var cInt = db.get('interfaces');
var routerObj = {};
var loginCode;
var loginTime;
var token;
var offsetTime;
var crypto = require('crypto');
var jwt = require('jsonwebtoken');

function md5 (text) {
  return crypto.createHash('md5').update(text).digest('hex');
};
function getCode() {
  var Num ="";
  for(var i = 0;i < 4;i++) {
     Num += Math.floor(Math.random()*10);
  }
  return Num;
};
function loadInterface(callback) {
  //console.log(Math.floor(Math.random()*10000));
  routerObj = {};
  mock.clearRoutes();
  cInt.find({}, {
    $ne: {
      valide: false
    },
    sort: {
      url: 1,
      oid: -1
    }
  }, function (err, data) {
    //console.log(data);
    //console.log(data[0].login+'111111111111111111111111');
    if (err) throw err;
    console.log('------', 'load interfaces start...');
    data.forEach(function (it) {
      //console.log('111111111111');
      //console.log(it.inSchema);
      var path = it.url.split('?')[0];
      var method = 'delete' === it.method ? 'del' : it.method;
      var login = it.login;
      var inObject = it.inObject;
      var key =  path + '####' + method + '####' + login + '####' + inObject;
      routerObj[key] = routerObj[key] || [];
      routerObj[key].push(it);
      
      //console.log(path, method);
    });
    for (var key in routerObj) {
      _registerRouter(key.split('####')[0], key.split('####')[1], key.split('####')[2], key.split('####')[3],routerObj[key]);
    }
    console.log('------', 'loaded ' + _.keys(routerObj).length + ' interfaces~');
    if (callback) callback();
  });
}

function _registerRouter(path, method, login, inObject, interfaceList) {
  if(['get', 'put', 'post', 'delete'].indexOf(method)>-1) {
    console.log(method +"-----" + path +"-----" + login);
    
    mock[method](path, function (req) {
      if (login == 'true') {
       //req.headers['fesco-sign']
        //console.log(req.headers['fesco-token']);
        /*console.log(req.headers['fesco-time']);
        console.log(req.headers['fesco-sign']);*/
        var tempToken = token;

        var tempSign = md5('fescoApp' + loginTime + req.headers['fesco-time']+ inObject);
        console.log(tempToken);
        console.log(loginTime);
        console.log(md5('fescoApp' + loginTime + 1495012449000 + inObject));
        //console.log('1111111111111111111111');
        //console.log(tempSign);
        //console.log(req.headers['fesco-token']);
        //console.log(token);
          if(!req.headers['fesco-token'] || !req.headers['fesco-time'] || !req.headers['fesco-sign']){
            return {
                result: {
                  "status": -1,
                  "msg": "请填写token",
                  "data": {}
                }
            }
          } else if (req.headers['fesco-token'] != token || 
    //        req.headers['fesco-time'] != ''+(parseInt(offsetTime) + Date.parse(new Date()))|| 
            req.headers['fesco-sign'] != md5('fescoApp' + loginTime + req.headers['fesco-time']+ inObject)
            ) {
            return {
              result: {
                "status": -1,
                "msg":"Token填写不正确，请重新填写！",
                "data":{}
              }
            }
          } else {
              var result = {};
              var name = '';
              interfaceList.forEach(function (ifc) {
                try {
                  var inSchema = ifc.inSchema ? JSON.parse(ifc.inSchema) : {};
                  var outObject = Mock.mock(JSON.parse(ifc.outObject));
                  var validate = jsen(inSchema);
                  var check = validate(req.body);
                  if (_.isEmpty(result) || check) {
                    result = check ? outObject : validate.errors;
                    name = ifc.name;
                  }
                } catch (e) {
                  console.error('接口出错', e);
                }
          });
              return {result: result,name:name};
          }
      }
      //console.log(req.headers);
      var result = {};
      var name = '';
      interfaceList.forEach(function (ifc) {
        try {
          var inSchema = ifc.inSchema ? JSON.parse(ifc.inSchema) : {};
          var outObject = Mock.mock(JSON.parse(ifc.outObject));
          var validate = jsen(inSchema);
          var check = validate(req.body);
          if (_.isEmpty(result) || check) {
            result = check ? outObject : validate.errors;
            name = ifc.name;
          }
        } catch (e) {
          console.error('接口出错', e);
        }
      });
      return {result: result,name:name};
    });
  }
}
router.all('/rewrite/*', function (req, res) {
  loadInterface(function () {
    res.send('重启 mock服务器 成功!');
  });
}).get('', function (req, res) {
  res.render('index', {
    title: 'api-mock-server'
  });
}).all('*', function (req, res) {
  //send request to superagent-mock for rest api
  var extPram = _.extend(req.body,req.query);
  //console.log(req.headers);
  var temPath = req.path;
  //console.log(req.method.toLowerCase() +"-----" + req.path);
  request[req.method.toLowerCase()](req.path).send(_.extend(req.body,req.query))
  .set('Fesco-Token', req.headers['fesco-token'])
  .set('Fesco-Time', req.headers['fesco-time'])
  .set('Fesco-Sign', req.headers['fesco-sign'])
  .end(function (err, data) {
    if (err) {
      console.error(err);
      res.status(500).json(err);
    } else {
      if(data.name) {
        res.set('name', encodeURI(data.name));
      }
      //console.log('rrrrrrr');
      //console.log(temPath);
      if(temPath == '/login/sendCode'){
        if (data.result.data){
          data.result.data.code = getCode();
          //Math.random.toString(36);
          loginCode = data.result.data.code;
        }
      } else if(temPath == '/login'){
        //console.log('ggggggggggggg');
        if (extPram.code && extPram.code != loginCode){
            data.result ={
              "status": -1,
              "message": "验证码不正确!",
              "data": {
              }
            }
        } else if (data.result.data && data.result.data.token) {
            token = jwt.sign(extPram, 'app.get(superSecret)', {
                         'expiresIn': 1440
            });
            console.log(token);
            data.result.data.token = token;
            data.result.data.logintime = Date.parse(new Date());
            loginTime = data.result.data.logintime;
            //offsetTime = data.result.data.logintime-Date.parse(new Date());
        } 
      }
      res.json(data.result);
    }
  });
});
loadInterface();
module.exports = router;
