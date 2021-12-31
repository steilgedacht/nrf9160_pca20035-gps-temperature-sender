var net = require('net');
var redis = require('redis');
var client = redis.createClient();

function writeToFile(data) {
    var Daten = data.toString().split(',');

    client.lpush('latitude', Daten[0], function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    client.lpush('longitude', Daten[1], function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    client.lpush('Geschwindigkeit', Daten[2], function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    client.lpush('Beschleunigungsereignis', Daten[3], function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    client.lpush('Temperatur', Daten[4].slice(0, 2), function(err, res) { // nimmt nur die ersten 2 Zeichen des Strings, da danach ein \n kommt und dieser nicht gespeichert werden soll
        if (err) {
            return console.log(err);
        }
    });

    var Time_and_Date = new Date();
    client.lpush('Datum', Time_and_Date.getDate().toString() + "." + (Time_and_Date.getMonth() + 1).toString() + "." + Time_and_Date.getFullYear().toString(), function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    client.lpush('Akku', Daten[5], function(err, res) {
        if (err) {
            return console.log(err);
        }
    });

    var Minuten = Time_and_Date.getMinutes();
    if (Minuten < 10) {
        Minuten = '0' + Minuten.toString();
    }
    client.lpush('Zeit', (Time_and_Date.getHours() + 1).toString() + ":" + Minuten, function(err, res) {
        if (err) {
            return console.log(err);
        }
    });
    console.log(Daten + "  :" + Minuten);
}

var server = net.createServer(function(socket) {
    socket.write('Echo server\r\n');
    socket.on('data', function(data) {
        writeToFile(data);
    });
    socket.pipe(socket);
});

server.listen(9160);