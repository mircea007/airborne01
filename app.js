var express = require("express");
var fs = require("fs");
var app = express();
var serv = require("http").Server(app);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/client/index.html');
});

app.use('/client', express.static(__dirname + '/client'));

serv.listen(process.env.PORT || 2000);

function getDistance( x1, y1, x2, y2 ){
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

function abs( n ){
  if( n < 0 )
    return -n;
  else
    return n;
}

function sign( n ){
  if( n < 0 )
    return -1;
  else
    return 1;
}

function copyObj( Obj ){
  var obj = {};
  for( prop in Obj ){
    obj[prop] = Obj[prop];
  }
  
  return obj;
}

var planes = {
  normal: {
    MAX_HEALTH: 100,
    HEALTH_REGEN: 10,
    SPEED: 20,
    BULLET_SPEED: 60,
    BULLET_DURATION: 25,
    BULLET_DAMAGE: 10,
    KILL_DISTANCE: 15,
    IMG_SRC: 'client/img/plane.png',
    BULLET_IMG_SRC: 'client/img/bullet.png',
    PLAYERWIDTH: 200,
    BULLETWIDTH: 10,
    REQUIRED_AUTOS: []
  },
  
  Xplane: {
    MAX_HEALTH: 10000,
    HEALTH_REGEN: 10000,
    SPEED: 30,
    BULLET_SPEED: 60,
    BULLET_DURATION: 100,
    BULLET_DAMAGE: 5000,
    KILL_DISTANCE: 30,
    IMG_SRC: 'client/img/Xplane.png',
    BULLET_IMG_SRC: 'client/img/laser_bullet.png',
    PLAYERWIDTH: 40,
    BULLETWIDTH: 30,
    REQUIRED_AUTOS: [{Func: function(data){
      ID = data.ID;
      PARENT = data.PARENT;

      Players[ID].x = Players[PARENT].x;
      Players[ID].y = Players[PARENT].y;
      Players[ID].plane.IMG_SRC = 'client/img/nothing.png';
      Players[ID].plane.BULLET_IMG_SRC = 'client/img/bullet.png';
      Players[PARENT].score += Players[ID].score;
      Players[ID].score = 0;
      Players[ID].hidden = true;
      Players[ID].plane.BULLET_SPEED = 150;
      Players[ID].plane.BULLET_DAMAGE = 90;
      Players[ID].plane.KILL_DISTANCE = 30;
      
      if( Object.keys(Players).length > 2 ){
        var nearest = null;
        for( var player in Players ){
          if( player != ID && player != PARENT ){
            if( nearest == null ){
              nearest = player;
            }else{
              if( getDistance(Players[nearest].x, Players[nearest].y, Players[ID].x, Players[ID].y) > getDistance(Players[player].x, Players[player].y, Players[ID].x,   Players[ID].y) )
                nearest = player;
            }
          }
        }
    
        mx = Players[nearest].x;
        my = Players[nearest].y;
        shootBullet(ID);
      }else{
        mx = 0;
        my = 0;
      }
    
      pointTowards(ID, mx, my);
    }, Data: {}}]
  }
}

MAX_HEALTH = 100;
HEALTH_REGEN = 10;
REGEN_RATE = 1000;
SPEED = 10;
BULLET_SPEED = 50;
BULLET_DURATION = 25;
BULLET_DAMAGE = 10;
ARENA_SIZE = 10000;
KILL_DISTANCE = 15;
MAX_PLAYERS = 20;
SMOKE_DURATION = 30;
SMOKE_DELAY = 0;
MAX_ANGLE = Math.PI / 18;/* 5 degrees */

var Autos   = {};
var Players = {};
var Sockets = {};
var Bullets = {};
var Smoke   = {};
var num_players = 0;
var num_bullets = 0;
var num_autos   = 0;
var num_smoke   = 0;

function shootBullet(ID){
  Bullets[num_bullets] = {
    shooter: ID,
    dir: Players[ID].dir,
    x: Players[ID].x,
    y: Players[ID].y,
    age: 0,
    config: Players[ID].plane
  };
  num_bullets++;
}

function setDirection(ID, radians){
  Players[ID].dir = radians;
}

function pointTowards(ID, x, y){
  var angle;
  var px = Players[ID].x;
  var py = Players[ID].y;
  
  if( y < py )
    angle = Math.asin((x - px) / getDistance(px, py, x, y));
  else
    angle = Math.PI - Math.asin((x - px) / getDistance(px, py, x, y));
  
  setDirection(ID, angle);
} 

function setSpeed(ID, percent){
  if( percent > 100 )
    percent = 100;
  else if( percent < 0 )
    percent = 0;
  
  Players[ID].speed = Players[ID].plane.SPEED * percent / 100;
}

function setName(ID, name){
  Players[ID].name = name;
}

function createAuto(Func, Data){
  Players[num_players] = {
    name: '',
    x: Math.floor(ARENA_SIZE * Math.random()),
    y: Math.floor(ARENA_SIZE * Math.random()),
    dir: 0,
    health: planes.normal.MAX_HEALTH,
    score: 0,
    plane: Object.create(planes.normal),
    speed: planes.normal.SPEED,
    hidden: false,
    autos: []
  };
  Data.ID = num_players;
  num_players++;
  setPlane(Data.ID, planes.normal);
  
  var ID = num_autos;
  Autos[ID] = {
    run: Func,
    data: Data
  }
  num_autos++;
  
  return ID;
}

function deleteAuto(ID){
  delete Players[Autos[ID].data.ID];
  delete Autos[ID];
}

function setPlane(ID, _plane){
  var plane = copyObj(_plane );
  var req_autos = plane.REQUIRED_AUTOS;
  var data;
  var auto;
  
  Players[ID].plane = plane;
  Players[ID].speed = plane.SPEED;
  Players[ID].health = plane.MAX_HEALTH;
  
  for( auto in Players[ID].autos ){
    deleteAuto(auto);
  }
  Players[ID].autos = [];
  
  for( auto in req_autos ){
    data = req_autos[auto].Data;
    data.PARENT = ID;
    Players[ID].autos[Players[ID].autos.length] = createAuto(req_autos[auto].Func, data);
  }
}

function deletePlayer(ID){
  if( Players[ID] != null ){
    for( auto in Players[ID].autos )
      deleteAuto(Players[ID].autos[auto]);
    delete Players[ID];
  }
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
  socket.id = null;
  socket.pressing = [];
  console.log('socket connection');
  
  // Game
  // regen
  setInterval(function(){
    if( socket.id != null && Players[socket.id] != null ){
      Players[socket.id].health += Players[socket.id].plane.HEALTH_REGEN;
      if( Players[socket.id].health > Players[socket.id].plane.MAX_HEALTH )
        Players[socket.id].health = Players[socket.id].plane.MAX_HEALTH;
    }
  }, REGEN_RATE);
  
  // login
  socket.on('join', function(data){
    if( data.name == "" )
      data.name = "unnamed";
    if( Object.keys(Players).length < MAX_PLAYERS ){
      Players[num_players] = {
        name: data.name,
        x: Math.floor(ARENA_SIZE * Math.random()),
        y: Math.floor(ARENA_SIZE * Math.random()),
        dir: 0,
        health: MAX_HEALTH,
        score: 0,
        plane: planes.normal,
        speed: planes.normal.SPEED,
        hidden: false
      };
      num_players++;
      socket.id = num_players - 1;
      setPlane(socket.id, planes.normal);
      Sockets[socket.id] = socket;
      socket.emit('loginConfirm', {id: socket.id});
    }
  });
  
  // get keypress
  socket.on('keyState', function(data){
    socket.pressing[data.key] = data.state;
    if( socket.id != null && Players[socket.id] != null ){
      if( socket.pressing[32] ){// create bullet
        shootBullet(socket.id);
      }
    }
  });
  
  // get mouse angle
  socket.on('mouseAngle', function(angle){
    if( socket.id != null ){
      if( abs(angle - Players[socket.id].dir) > MAX_ANGLE )
        angle = Players[socket.id].dir + sign(angle - Players[socket.id].dir) * MAX_ANGLE;
      Players[socket.id].dir = angle;
    }
  });
  
  socket.on('upgrade', function(){
    setPlane(socket.id, planes.Xplane);
  });
  
  // disconect
  socket.on('disconnect', function(){
    deletePlayer(socket.id);
    delete Sockets[socket.id];
  });
});

/*
createAuto(function(data){
  var ID = data.id;
  
  if( Object.keys(Players).length > 1 ){
    var nearest = null;
    for( var player in Players ){
      if( player != ID ){
        if( nearest == null ){
          nearest = player;
        }else{
          if( getDistance(Players[nearest].x, Players[nearest].y, Players[ID].x, Players[ID].y) > getDistance(Players[player].x, Players[player].y, Players[ID].x,   Players[ID].y) )
            nearest = player;
        }
      }
    }
    
    mx = Players[nearest].x;
    my = Players[nearest].y;
  }else{
    mx = 0;
    my = 0;
  }
    
  pointTowards(ID, mx, my);
  shootBullet(ID);
  
}, {});*/

// make objects go forward, update clients of new coords and run autos
setInterval(function(){
  var incx, incy;
  
  // run Autos
  for( var auto in Autos )
    Autos[auto].run(Autos[auto].data);
  
  // make players go forward
  for( player in Players ){
    angle = Players[player].dir;
    incx = Math.sin(angle) * Players[player].speed;
    incy = Math.sqrt(Players[player].speed * Players[player].speed - incx * incx);
    
    if( Players == undefined )
      console.log('nononono');
    
    var oldx = Players[player].x;
    var oldy = Players[player].y;
    
    if( angle > Math.PI / 2 ){
      Players[player].x += incx;
      Players[player].y += incy;
    }else{
      Players[player].x += incx;
      Players[player].y -= incy;
    }
      
    // If the user wants to get ot of the arena
    if( (Players[player].x < 0 || Players[player].x > ARENA_SIZE) || (Players[player].y < 0 || Players[player].y > ARENA_SIZE) ){
      Players[player].x = oldx;
      Players[player].y = oldy;
    }
  }
  
  for( var bullet in Bullets ){
    if( Bullets[bullet] != null ){
      incx = Math.sin(Bullets[bullet].dir) * Bullets[bullet].config.BULLET_SPEED;
      incy = Math.sqrt(Bullets[bullet].config.BULLET_SPEED * Bullets[bullet].config.BULLET_SPEED - incx * incx);
    
      if( Bullets[bullet].dir > Math.PI / 2 ){
        Bullets[bullet].x += incx;
        Bullets[bullet].y += incy;
      }else{
        Bullets[bullet].x += incx;
        Bullets[bullet].y -= incy;
      }
      
      for( var player in Players ){
        if( Players[player] != null && Bullets[bullet] != null && Players[Bullets[bullet].shooter] != null ){
          if( getDistance(Bullets[bullet].x, Bullets[bullet].y, Players[player].x, Players[player].y) <= Bullets[bullet].config.KILL_DISTANCE && player != Bullets[bullet].shooter ){
            Players[player].health -= Bullets[bullet].config.BULLET_DAMAGE;
            if( Players[player].health <= 0 ){
              if( Sockets[player] != null ){
                Sockets[player].emit('killed', {killer: Bullets[bullet].shooter});
                Sockets[player].id = null;
              }
              if( Sockets[Bullets[bullet].shooter] != null )
                Sockets[Bullets[bullet].shooter].emit('kill', {victim: player});
              Players[Bullets[bullet].shooter].score += 15;
              setTimeout(function(){}, 10);
              deletePlayer(player);
            }
            delete Bullets[bullet];
          }
        }
      }
    
      if( Bullets[bullet] != null ){
        Bullets[bullet].age += 1;
        if( Bullets[bullet].age > Bullets[bullet].config.BULLET_DURATION )
          delete Bullets[bullet];
      }
    }
  }
  
  for( smoke in Smoke ){
    Smoke[smoke].age += 1;
    if( Smoke[smoke].age > SMOKE_DELAY )
      Smoke[smoke].hidden = false;
  }
  
  // update coords
  io.sockets.emit('playerUpdate', {players: Players});
  io.sockets.emit('bulletUpdate', {bullets: Bullets});
  io.sockets.emit('smokeUpdate', {smoke: Smoke});
}, 1000/25);

setInterval(function(){
  for( player in Players ){
    Smoke[num_smoke] = {
      x: Players[player].x,
      y: Players[player].y,
      hidden: true,
      age: 0
    };
    num_smoke++;
  }
  
  for( smoke in Smoke ){
    if( Smoke[smoke].age > SMOKE_DURATION )
      delete Smoke[smoke];
  }
}, 1000/50);