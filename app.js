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

function Delete(arr, i){
  arr.splice(i, 1);
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
var io = require('socket.io')(serv,{});
io.sockets.on('connection', function(socket){
  socket.id = null;
  socket.pressing = [];
  console.log('socket connection');
  
  // regen
  setInterval(function(){
    if( socket.id != null && Players[socket.id] != null ){
      Players[socket.id].health += HEALTH_REGEN;
      if( Players[socket.id].health > MAX_HEALTH )
        Players[socket.id].health = MAX_HEALTH;
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
        score: 0
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
        Bullets[num_bullets] = {
          shooter: socket.id,
          dir: Players[socket.id].dir,
          x: Players[socket.id].x,
          y: Players[socket.id].y,
          age: 0
        };
        num_bullets++;
      }
    }
  });
  
  // get mouse angle
  socket.on('mouseAngle', function(angle){
    if( socket.id != null ){
      var incx = Math.sin(angle) * SPEED;
      var incy = Math.sqrt(SPEED * SPEED - incx * incx);
    
      if( Players == undefined )
        console.log('nononono');
    
      var oldx = Players[socket.id].x;
      var oldy = Players[socket.id].y;
    
      if( angle > Math.PI / 2 ){
        Players[socket.id].x += incx;
        Players[socket.id].y += incy;
      }else{
        Players[socket.id].x += incx;
        Players[socket.id].y -= incy;
      }
      
      // If the user wants to get ot of the arena
      if( (Players[socket.id].x < 0 || Players[socket.id].x > ARENA_SIZE) || (Players[socket.id].y < 0 || Players[socket.id].y > ARENA_SIZE) ){
        Players[socket.id].x = oldx;
        Players[socket.id].y = oldy;
      }
      
      Players[socket.id].dir = angle;
    }
  });
  
  // disconect
  socket.on('disconnect', function(){
    delete Players[socket.id];
    delete Sockets[socket.id];
  });
});

// make bullets go forward and update clients of new coords
setInterval(function(){
  var incx, incy;
  for( var bullet in Bullets ){
    if( Bullets[bullet] != null ){
      incx = Math.sin(Bullets[bullet].dir) * BULLET_SPEED;
      incy = Math.sqrt(BULLET_SPEED * BULLET_SPEED - incx * incx);
    
      if( Bullets[bullet].dir > Math.PI / 2 ){
        Bullets[bullet].x += incx;
        Bullets[bullet].y += incy;
      }else{
        Bullets[bullet].x += incx;
        Bullets[bullet].y -= incy;
      }
      
      for( var player in Players ){
        if( Players[player] != null && Bullets[bullet] != null ){
          if( getDistance(Bullets[bullet].x, Bullets[bullet].y, Players[player].x, Players[player].y) <= KILL_DISTANCE && player != Bullets[bullet].shooter ){
            Players[player].health -= BULLET_DAMAGE;
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
        if( Bullets[bullet].age > BULLET_DURATION )
          delete Bullets[bullet];
      }
    }
  }
  
  io.sockets.emit('playerUpdate', {players: Players});
  io.sockets.emit('bulletUpdate', {bullets: Bullets});
}, 1000/25);

