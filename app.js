// server stuff:
var express = require("express");
var fs = require("fs");
var app = express();
var serv = require("http").Server(app);

process.on('SIGINT', function() {
    process.exit();
});

app.use('', express.static(__dirname + '/client'));
app.use('/client', express.static(__dirname + '/client'));

serv.listen(process.env.PORT || 2000);

// useful functions

function getDistance( x1, y1, x2, y2 ){
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
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
    HEALTH_REGEN: 2,
    REGEN_RATE: 1000,
    SPEED: 20,
    BULLET_SPEED: 60,
    BULLET_DURATION: 25,
    BULLET_DAMAGE: 10,
    KILL_DISTANCE: 30,
    IMG_SRC: 'client/img/plane.png',
    BULLET_IMG_SRC: 'client/img/bullet.png',
    PLAYERWIDTH: 200,
    BULLETWIDTH: 10,
    NBULLETS: 100,
    RELOAD_TIME: 1000,
    MAX_ANGLE: Math.PI / 18,// 10 degrees
    REQUIRED_AUTOS: []
  },
  
  Xplane: {
    MAX_HEALTH: 10000,
    HEALTH_REGEN: 10000,
    REGEN_RATE: 200,
    SPEED: 30,
    BULLET_SPEED: 60,
    BULLET_DURATION: 100,
    BULLET_DAMAGE: 5000,
    KILL_DISTANCE: 30,
    IMG_SRC: 'client/img/Xplane.png',
    BULLET_IMG_SRC: 'client/img/laser_bullet.png',
    PLAYERWIDTH: 40,
    BULLETWIDTH: 30,
    NBULLETS: 1000000,
    RELOAD_TIME: 0,
    MAX_ANGLE: Math.PI / 18,// 10 degrees
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

// usefull constants
SERVER_FPS = 25;
ARENA_SIZE = 10000;
MAX_PLAYERS = 15;
SMOKE_DURATION = 60;
SMOKE_DELAY = 0;
KILL_SCORE = 15;

var Autos   = {};
var Players = {};
var Sockets = {};
var Bullets = {};
var Smoke   = {};
var num_players = 0;
var num_bullets = 0;
var num_autos   = 0;
var num_smoke   = 0;

function shootBullet( ID ){
  if( !Players[ID].reloading ){
    if( Players[ID].remaining > 0 ){
      Bullets[num_bullets] = {
        shooter: ID,
        dir: Players[ID].dir,
        x: Players[ID].x,
        y: Players[ID].y,
        age: 0,
        config: Players[ID].plane
      };
      num_bullets++;
      Players[ID].remaining--;
    }else{
      Players[ID].reloading = true;
      setTimeout(function(){
        Players[ID].remaining = Players[ID].plane.NBULLETS;
        Players[ID].reloading = false;
      }, Players[ID].plane.RELOAD_TIME);
    }
  }
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
    remaining: planes.normal.NBULLETS,
    reloading: false,
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

function sendMessage( message, ID ){
  if( ID != null )
    ID = Players[ID].name;
  else
    ID = 'server';
  
  io.sockets.emit('new message', {from: ID, msg: message});
}

function regen( ID ){
  if( Players[ID] != null ){// if the player didn't exit
    Players[ID].health += Players[ID].plane.HEALTH_REGEN;
    if( Players[ID].health > Players[ID].plane.MAX_HEALTH )
      Players[ID].health = Players[ID].plane.MAX_HEALTH;
    setTimeout(function(){regen(ID)}, Players[ID].plane.REGEN_RATE);
  }
}

var io = require('socket.io')(serv, {});
io.sockets.on('connection', function(socket){
  socket.id = null;
  socket.pressing = [];
  console.log('socket connection');

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
        health: planes.normal.MAX_HEALTH,
        score: 0,
        plane: planes.normal,
        speed: planes.normal.SPEED,
        hidden: false,
        remaining: planes.normal.NBULLETS,
        reloading: false
      };
      regen(num_players);
      sendMessage(data.name + ' joined the game', null);
      num_players++;
      socket.id = num_players - 1;
      setPlane(socket.id, planes.normal);
      Sockets[socket.id] = socket;
      socket.emit('loginConfirm', {id: socket.id});
    }else
      socket.emit('loginDenial', {reason: 'too may players'});
  });
  
  // get keypress
  socket.on('keyState', function(data){
    if( socket.id != null && Players[socket.id] != null )
      socket.pressing[data.key] = data.state;
  });
  
  // get mouse angle
  socket.on('mouseAngle', function(angle){
    if( socket.id != null ){
      var dif, dir = Players[socket.id].dir, max = Players[socket.id].plane.MAX_ANGLE;
      if( dir < angle ){
        if( (dif = angle - dir) > max ){
          if( dif < Math.PI )
            angle = dir + max;
          else
            angle = (dir - max + 2 * Math.PI) % (2 * Math.PI);
        }
      }else{
        if( (dif = dir - angle) > max ){
          if( dif < Math.PI )
            angle = dir - max;
          else
            angle = (dir + max) % (2 * Math.PI);
        }
      }
      
      Players[socket.id].dir = angle;
    }
  });
  
  socket.on('upgrade', function(){
    setPlane(socket.id, planes.Xplane);
  });

  socket.on('send message', function(message){
    if( socket.id != null )
      sendMessage(message, socket.id);
  });
  
  // disconect
  socket.on('disconnect', function(){
    console.log('socket disconnect');
    if( socket.id != null ){
      sendMessage(Players[socket.id].name + ' left the game')
      deletePlayer(socket.id);
      delete Sockets[socket.id];
    }
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
  
  // make players go forward and regen
  for( player in Players ){
    angle = Players[player].dir;
    incx = Math.sin(angle) * Players[player].speed;
    incy = Math.sqrt(Players[player].speed * Players[player].speed - incx * incx);

    var oldx = Players[player].x;
    var oldy = Players[player].y;
    
    if( angle > Math.PI / 2 &&  angle < Math.PI + Math.PI / 2 ){
      Players[player].x += incx;
      Players[player].y += incy;
    }else{
      Players[player].x += incx;
      Players[player].y -= incy;
    }
      
    // If the player wants to get ot of the arena
    if( (Players[player].x < 0 || Players[player].x > ARENA_SIZE) || (Players[player].y < 0 || Players[player].y > ARENA_SIZE) ){
      Players[player].x = oldx;
      Players[player].y = oldy;
    }

    if( Sockets[player] != null && Sockets[player].pressing != null ){
      if( Sockets[player].pressing[' '] )
        shootBullet(player);
      else if( Sockets[player].pressing['r'] ){
        Players[player].reloading = true;
        setTimeout(function(){
          Players[player].remaining = Players[player].plane.NBULLETS;
          Players[player].reloading = false;
        }, Players[player].plane.RELOAD_TIME);
      }
    }
  }
  
  for( var bullet in Bullets ){
    incx = Math.sin(Bullets[bullet].dir) * Bullets[bullet].config.BULLET_SPEED;
    incy = Math.sqrt(Bullets[bullet].config.BULLET_SPEED * Bullets[bullet].config.BULLET_SPEED - incx * incx);
        
    if( Bullets[bullet].dir > Math.PI / 2 && Bullets[bullet].dir < Math.PI + Math.PI / 2 ){
      Bullets[bullet].x += incx;
      Bullets[bullet].y += incy;
    }else{
      Bullets[bullet].x += incx;
      Bullets[bullet].y -= incy;
    }
      
    for( var player in Players ){
      if( Bullets[bullet] && [Bullets[bullet].shooter] ){
        if( getDistance(Bullets[bullet].x, Bullets[bullet].y, Players[player].x, Players[player].y) <= Bullets[bullet].config.KILL_DISTANCE && player != Bullets[bullet].shooter ){
          Players[player].health -= Bullets[bullet].config.BULLET_DAMAGE;
          if( Players[player].health <= 0 ){
            if( Players[player] && Players[Bullets[bullet].shooter] )
              sendMessage(Players[Bullets[bullet].shooter].name + ' killed ' + Players[player].name);

            if( Sockets[player] ){
              Sockets[player].emit('killed', {killer: Bullets[bullet].shooter});
              Sockets[player].id = null;
            }
            if( Sockets[Bullets[bullet].shooter] )
              Sockets[Bullets[bullet].shooter].emit('kill', {victim: player});
            Players[Bullets[bullet].shooter].score += KILL_SCORE;
            deletePlayer(player);
          }
          delete Bullets[bullet];
        }
      }
    }
      
    if( Bullets[bullet] ){
      Bullets[bullet].age += 1;
      if( Bullets[bullet].age > Bullets[bullet].config.BULLET_DURATION )
        delete Bullets[bullet];
    }
  }

  for( smoke in Smoke ){
    Smoke[smoke].age += 1;
    if( Smoke[smoke].age > SMOKE_DELAY )
      Smoke[smoke].hidden = false;

    Smoke[smoke].x += Smoke[smoke].dx;
    Smoke[smoke].y += Smoke[smoke].dy;
  }

  // send screen-update to client
  io.sockets.emit('screen-update', {players: Players, bullets: Bullets, smoke: Smoke});
}, 1000/SERVER_FPS);

setInterval(function(){
  for( player in Players ){
    Smoke[num_smoke] = {
      x: Players[player].x,
      y: Players[player].y,
      dx: Math.random() - 0.5,
      dy: Math.random() - 0.5,
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

// print ip's for user

var ip = require("ip");
var local_ip = ip.address();
var extip = require('external-ip')();

console.log("Server is online")
console.log("To close server press Ctrl-C\n")
console.log("You can access the game at http://localhost:2000/")
console.log("Players on your network can access game at http://" + local_ip + ":2000/")
extip(function( err, ip ){ console.log("Players outside your network can access game at http://" + ip + ":2000/"); });
