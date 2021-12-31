const request = require('request');
var redis = require('redis');
var client = redis.createClient();

var Weidezauncounter,
    Weidezaunkoordinatenlat,
    Weidezaunkoordinatenlng,
    Wasserstellenkoordinatenlat,
    Wasserstellenkoordinatenlng,
    Viehpositionlat,
    Viehpositionlng,
    Wasserstelleaufgesucht = false,
    timestamp,
    Akku;

function insidepolygon(point, vs) { // von Stackoverflow, habe es aber auf Herz und Nieren geprüft

    var x = point[0],
        y = point[1];

    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0],
            yi = vs[i][1];
        var xj = vs[j][0],
            yj = vs[j][1];

        var intersect = ((yi > y) != (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
};

function Berechne_Beschleunigungsereignis() {
    if (Beschleunigungsereignis == 1) {
        request('https://api.telegram.org/bot1098231225:AAEvILEzilSRVkH5TbfSBd4fj9QRRY4WVD4/sendMessage?chat_id=-255134108&text=Dein+Vieh+lief+vor+etwas+weg',
            (err, res, body) => {
                console.log(body);
            });
    }
}

function Berechne_Wasserstelle() {
    var radius = 5;
    for (index = 0; index < Wasserstellenkoordinatenlat.length; index++) {
        var deltalat, deltalng, Betrag;
        deltalat = Viehpositionlat - parseFloat(Wasserstellenkoordinatenlat[index]);
        deltalng = Viehpositionlng - parseFloat(Wasserstellenkoordinatenlng[index]);
        Betrag = Math.sqrt(Math.pow(deltalat, 2) + Math.pow(deltalng, 2));
        if (Betrag < radius) {
            Wasserstelleaufgesucht = true;
            var date = new Date();
            timestamp = date.getTime();
        } else {
            Wasserstelleaufgesucht = false;
        }
    }
    var datenow = new Date();
    if (datenow.getTime() - timestamp > 129600000) { // 1,5 Tage in Milisekunden
        request('https://api.telegram.org/bot1098231225:AAEvILEzilSRVkH5TbfSBd4fj9QRRY4WVD4/sendMessage?chat_id=-255134108&text=Dein+Vieh+hat+die+eingezeichnete+Wasserstelle+seit+1,5+Tagen+nicht+mehr+aufgesucht.+Es+fühlt+sich+vielleicht+nicht+wohl+und+ist+krank.',
            (err, res, body) => {
                console.log(body);
            });
    }
}

function Nummer_im_Array_enthalten(wc, aN) {
    for (index = 0; index < wc.length; index++) {
        if (wc[index] == aN) {
            return true;
        }
    }
    return false;
}

function Berechne_Weidezaun() {
    var Weidezauncounter_reduziert = [],
        in_einem_Zaun = false;

    for (i = 0; i < Weidezauncounter.length; i++) { // Berechnet ein Array, das alle Zahlen des Counter arrays nur ein mal enthält
        if (Nummer_im_Array_enthalten(Weidezauncounter_reduziert, Weidezauncounter[i]) == false) {
            Weidezauncounter_reduziert.push(Weidezauncounter[i]);
        }
    }

    for (index = 0; index < Weidezauncounter_reduziert.length; index++) { // Schleife, die für jeden Wert in Weidezauncounter_reduziert prüft, ob die kuh im Weidezaun ist.
        var Weidezaunkoordinaten = [];
        for (i = 0; i < Weidezaunkoordinatenlat.length; i++) { // einezlner Zaun wird zusammengebaut
            if (Weidezauncounter[i] == Weidezauncounter_reduziert[index]) {
                Weidezaunkoordinaten.push([parseFloat(Weidezaunkoordinatenlat[i]), parseFloat(Weidezaunkoordinatenlng[i])]);
            }
        }
        console.log(Weidezaunkoordinaten);
        if (insidepolygon([Viehpositionlat, Viehpositionlng], Weidezaunkoordinaten) == true) {
            in_einem_Zaun = true;
        }

    }

    if (in_einem_Zaun == false) {
        request('https://api.telegram.org/bot1098231225:AAEvILEzilSRVkH5TbfSBd4fj9QRRY4WVD4/sendMessage?chat_id=-255134108&text=Dein+Vieh+hat+den+virtuellen+Weidezaun+verlassen.',
            (err, res, body) => {
                console.log(body);
            });
    }
}

function Berechne_Akkustand() {
    if (parseInt(Akku) < 15) {
        request('https://api.telegram.org/bot1098231225:AAEvILEzilSRVkH5TbfSBd4fj9QRRY4WVD4/sendMessage?chat_id=-255134108&text=Dein+Akkustand+ist+unter+15%.',
            (err, res, body) => {
                console.log(body);
            });
    }
}

function Aktualisiere_Daten() {
    client.lrange('latitude', 0, 0, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Viehpositionlat = res[0];
        console.log(Viehpositionlat);
    });
    client.lrange('longitude', 0, 0, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Viehpositionlng = res[0];
        console.log(Viehpositionlng);
    });

    client.lrange('welatitude', 0, -1, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Weidezaunkoordinatenlat = res;
        console.log(Weidezaunkoordinatenlat);
    });
    client.lrange('welongitude', 0, -1, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Weidezaunkoordinatenlng = res;
        console.log(Weidezaunkoordinatenlng);
    });
    client.lrange('wezaunc', 0, -1, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Weidezauncounter = res;
        console.log(Weidezauncounter);
    });

    client.lrange('walatitude', 0, -1, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Wasserstellenkoordinatenlat = res;
        console.log(Wasserstellenkoordinatenlat);
    });
    client.lrange('walongitude', 0, -1, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Wasserstellenkoordinatenlng = res;
        console.log(Wasserstellenkoordinatenlng);
    });

    client.lrange('Beschleunigungsereignis', 0, 0, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Beschleunigungsereignis = res[0];
        console.log(Beschleunigungsereignis);
    });

    client.lrange('Akku', 0, 0, function(err, res) {
        if (err) {
            return console.log(err);
        }
        Akku = res[0];
        console.log(Akku);
    });
}

setInterval(function() {
    Aktualisiere_Daten();
    setTimeout(function() {
        Berechne_Beschleunigungsereignis();
        Berechne_Wasserstelle();
        Berechne_Weidezaun();
        Berechne_Akkustand();
    }, 3000);
}, 60000)