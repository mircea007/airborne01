var express = require("express");
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client', express.static(__dirname + '/client'));

serv.listen(process.env.PORT || 2000);

function getDistance( x1, y1, x2, y2 ){
  return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
}

var planes = {
  normal: {
    MAX_HEALTH: 100,
    HEALTH_REGEN: 10,
    SPEED: 10,
    BULLET_SPEED: 50,
    BULLET_DURATION: 25,
    BULLET_DAMAGE: 10,
    KILL_DISTANCE: 15,
    IMG_SRC: 'client/img/plane.png',
    PLAYERWIDTH: 200
  },
  
  Xplane: {
    MAX_HEALTH: 1000000,
    HEALTH_REGEN: 1000000,
    SPEED: 30,
    BULLET_SPEED: 100,
    BULLET_DURATION: 100,
    BULLET_DAMAGE: 1000000,
    KILL_DISTANCE: 30,
    IMG_SRC: 'client/img/Xplane.png',
    PLAYERWIDTH: 30
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

var Autos   = {};
var Players = {};
var Sockets = {};
var Bullets = {};
var num_players = 0;
var num_bullets = 0;
var num_autos   = 0;

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

function createAuto(Func, Data){
  Players[num_players] = {
    name: '',
    x: Math.floor(ARENA_SIZE * Math.random()),
    y: Math.floor(ARENA_SIZE * Math.random()),
    dir: 0,
    health: MAX_HEALTH,
    score: 0,
    plane: planes.Xplane
  };
  Data.id = num_players;
  num_players++;
  
  Autos[num_autos] = {
    run: Func,
    data: Data
  }
  num_autos++;
}

var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
  socket.id = null;
  socket.pressing = [];
  console.log('socket connection');
  
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
        plane: planes.normal
      };
      num_players++;
      socket.id = num_players - 1;
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
    if( socket.id != null )
      Players[socket.id].dir = angle;
  });
  
  socket.on('upgrade', function(){
    Players[socket.id].plane = planes.Xplane;
  });
  
  // disconect
  socket.on('disconnect', function(){
    delete Players[socket.id];
    delete Sockets[socket.id];
  });
});
/*
createAuto(function(data){
  var ID = data.id;
  
  var angle;
  var x = Players[ID].x;
  var y = Players[ID].y;
  
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
    
  if( my < y )
    angle = Math.asin((mx - x) / getDistance(x, y, mx, my));
  else
    angle = Math.PI - Math.asin((mx - x) / getDistance(x, y, mx, my));
  
  Players[ID].dir = angle;
  Players[ID].health = MAX_HEALTH;
  
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
    incx = Math.sin(angle) * Players[player].plane.SPEED;
    incy = Math.sqrt(Players[player].plane.SPEED * Players[player].plane.SPEED - incx * incx);
    
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
              if( Sockets[player] != null )
                Sockets[player].emit('killed', {killer: Bullets[bullet].shooter});
              if( Sockets[Bullets[bullet].shooter] != null )
                Sockets[Bullets[bullet].shooter].emit('kill', {victim: player});
              Sockets[player].id = null;
              Players[Bullets[bullet].shooter].score += 15;
              setTimeout(function(){}, 10);
              delete Players[player];
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
  
  // update coords
  io.sockets.emit('playerUpdate', {players: Players});
  io.sockets.emit('bulletUpdate', {bullets: Bullets});
}, 1000/25);

