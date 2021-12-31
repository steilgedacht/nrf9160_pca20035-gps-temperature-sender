var Datenarraylatitude = [],
    Datenarraylongitude = [],
    latitude = 46.8289,
    longitude = 12.76903,
    oldlatitude = 0,
    oldlongitude = 0,
    reading,
    letztespalte,
    placeholderlon,
    Wasserstelle = false,
    Weidezaun = false,
    Loesche_Symbol = false;

var map; // Eine Google Maps Karte wird erzeugt
var Tier_marker = []; // Array, das alle Marker von Tieren beihnaltet
var Wasserstelle_marker = []; // Array, das alle Marker von den Wasserstellen beinhaltet
var Weidezaeune = []; // Array, dass alle Weidezäue beinhaltet 
var Weidezaunselector = 0; // Variable um den Weidezaun zu selektieren
var Viehpfaddaten = []; // beinhaltet die Koordinaten der Polylinie, die im Viepfad gespeichert ist
var Viehpfad = []; // beinhaltet eine Polylinie, die den Pfad des Tieres anzeigtw
var infowindow;

// init Map --> intialisiert die Google Maps Karte und konfiguriert alle seine Funktionen
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: latitude, lng: longitude },
        zoom: 19,
        draggableCursor: 'crosshair'
    });

    //Clickevent, wenn auf die Map geklickt wird, wird ein die Funktion addlatLng aufgerufen
    map.addListener('click', zeichne_Symbol);
    // Diese Funktionen initialisieren den Rest der Website. 
    //Sie war zuerst in einer Bereit-wenn-geladen-Funktion, dort hat sie aber Fehler herbeigeführt
    lade_Daten();
    initialisiere_Buttons();
    erstelle_Weidezaun();
    addTiermarker();
    erstelle_Polyline();
}

// Zeichnet ein Symbol. Das Symbol ist abhängig davon, welches gewählt wurde
function zeichne_Symbol(event) { // fügt zum Zaun einen weiteren Eckpunkt hinzu
    if (Weidezaun == true) {
        var path = Weidezaeune[Weidezaunselector].getPath();
        path.push(event.latLng);
    }
    if (Wasserstelle == true) { // fügt einen Wassertrog hinzu
        erstelle_Wasserstelle(event);
    }
}

// Funktion, die die Datei auf dem Server öffnet, und sie in ein Array speichert.
function Lade_Vieh_Koordinaten() { // Funktion um Daten aus der Datenbank die Koordinaten auszulesen
    async function getlat() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/latitude/0/-1');
        const data = await responce.json();
        Datenarraylatitude = data.LRANGE;
    }
    getlat();

    async function getlng() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/longitude/0/-1');
        const data = await responce.json();
        Datenarraylongitude = data.LRANGE;
    }
    getlng();


    setTimeout(function() {
        latitude = parseFloat(Datenarraylatitude[0]); // String aus Array zu Float in Variable konvertieren
        longitude = parseFloat(Datenarraylongitude[0]);
    }, 250);


    if (oldlatitude != latitude || oldlongitude != longitude) { // Abfrage, falls sich die Koordinaten ändern, um den Marker neu zu setzen
        oldlatitude = latitude;
        oldlongitude = longitude;

        Viehpfaddaten = []; // Aktualisiert die Viehpafddaten mit den neuen Koordinaten
        for (index = 0; index < Datenarraylatitude.length; index++) {
            Viehpfaddaten.push({ lat: parseFloat(Datenarraylatitude[index]), lng: parseFloat(Datenarraylongitude[index]) });
        }

        Fahre_zu_neuer_Position();
        erstelle_Viehpfadsegmente();

        for (index = 0; index < Viehpfad.length; index++) {
            Viehpfad[index].setMap(null);
            Viehpfad[index].setMap(map);
        }

    }
}

function erstelle_Viehpfadsegmente() { // erstell in das Viehpfad array die einzenen Polylinien, die gebraucht werden um die Transperenz anzuzeigen
    Viehpfad = [];
    for (index = 0; index < Datenarraylatitude.length - 1; index++) { // Lengh -1 weil jedes Segment 2 Koordinaten benötigt und so zu 6 Koordinaten 5 Segmente gibt 

        var Koordinatenpaar = [];
        Koordinatenpaar.push(Viehpfaddaten[index]);
        Koordinatenpaar.push(Viehpfaddaten[index + 1]);

        var Opacity = Math.round((Math.exp(-index * 0.1)) * 100) / 100;

        var Pfad = new google.maps.Polyline({
            path: Koordinatenpaar,
            geodesic: true,
            strokeColor: '#FF9313',
            strokeOpacity: Opacity,
            strokeWeight: 7
        });
        Viehpfad.push(Pfad);
    }
}

function Aktualisiere_Website() {
    Lade_Vieh_Koordinaten();
    Aktualisiere_Viehpopup();
}

// Funktion, die alle 1000 Milisekunden aufgerufen wird, um die Daten zu aktualisieren
setInterval(function() {
    Aktualisiere_Website();
}, 1000)

// Schiebt die Google Maps Ansicht zu der zuletzt ausgelesenen Position
function Fahre_zu_neuer_Position() {
    Tier_marker[0].setPosition(new google.maps.LatLng(latitude, longitude));
    map.panTo(new google.maps.LatLng(latitude, longitude));
}

function initialisiere_Buttons() {
    $('#Wasserstelle').on('click', function() { // Selektiert einen tag nach id
        if (Wasserstelle == true) {
            Wasserstelle = false;
            document.getElementById('Wasserstelle').style.background = '#3a755f'; // Um die Farbe zu ändern wenn jemand drauf geklickt hat
        } else {
            Wasserstelle = true;
            document.getElementById('Wasserstelle').style.background = '#00482f';
        }
        Weidezaun = false;
        Loesche_Symbol = false;
        document.getElementById('Pfad_loeschen').style.background = '#3a755f';
        document.getElementById('Weidezaun').style.background = '#3a755f';
    });

    $('#Weidezaun').on('click', function() {
        bearbeite_bool_Weidezaun_auch_im_Dropdown(true);
    });

    $('#neuer_Weidezaun').on('click', function() {
        bearbeite_bool_Weidezaun_auch_im_Dropdown(false);
        erstelle_Weidezaun(); // erstellt einen neuen Weidezaun
        Weidezaunselector = Weidezaeune.length - 1; // um den neunen Weidezaun zu zeichnen muss der letzte im Array selektiert werden.
        $('.dropdown-content').append( // fügt einen neuen Untermenüpunkt hinzu, sobald auf Neuer_Weidezaun geklickt wird.
            '<div id="' +
            Weidezaunselector.toString() + // der Untermenüpukt trägt die ID mit dem Namennummer des Weidezauns, also Weidzaun1,...
            '" onClick="Weidezaunselektieren(this.id)">Weidezaun ' +
            Weidezaunselector.toString() +
            '</div>');
        Wasserstelle = false;
        Loesche_Symbol = false;
        document.getElementById('Wasserstelle').style.background = '#3a755f';
        document.getElementById('Pfad_loeschen').style.background = '#3a755f';
    });

    $('#Pfad_loeschen').on('click', function() {
        if (Loesche_Symbol == true) {
            Loesche_Symbol = false;
            document.getElementById('Pfad_loeschen').style.background = '#3a755f';
        } else {
            Loesche_Symbol = true;
            document.getElementById('Pfad_loeschen').style.background = '#00482f';
        }
        Weidezaun = false;
        Wasserstelle = false;
        document.getElementById('Wasserstelle').style.background = '#3a755f';
        document.getElementById('Weidezaun').style.background = '#3a755f';
    });

    $('#Speichern').on('click', function() {
        Speichere_Wasserstellen();
        Speichere_Weidezauene();
    });
}

//wird für die generierten Untermenüpunkte verwendet, sodass der richtige Selektiert wird, wenn darauf geklicht wird
function Weidezaunselektieren(clicked_id) {
    var zuloeschen = clicked_id.toString(); //für den Grenzfall 0 hat er denn selektierer auf -1 gesetzt
    if (Loesche_Symbol) { // Löscht den Weidezaun im Ganzen falls mit der Löschen funktion daraufgeklickt wird
        Weidezaeune[zuloeschen].setMap(null);
        Weidezaeune[clicked_id] = undefined;
        $("#" + zuloeschen.toString()).remove();
    } else {
        bearbeite_bool_Weidezaun_auch_im_Dropdown(false);
    }
    Weidezaunselector = clicked_id.toString();
    if (Weidezaunselector >= Weidezaeune.length) {
        Weidezaunselector--;
    }
}

function bearbeite_bool_Weidezaun_auch_im_Dropdown(Hauptpunkt) {
    if (Weidezaun == true) {
        if (Hauptpunkt == true) {
            Weidezaun = false;
            document.getElementById('Weidezaun').style.background = '#3a755f';
        }
    } else {
        Weidezaun = true;
        document.getElementById('Weidezaun').style.background = '#00482f';
    }
    Wasserstelle = false;
    Loesche_Symbol = false;
    document.getElementById('Wasserstelle').style.background = '#3a755f';
    document.getElementById('Pfad_loeschen').style.background = '#3a755f';
}

function addTiermarker() {
    var marker = new google.maps.Marker({ //fügt einen Marker hinzu, das ein Tier darstellt
        position: { lat: latitude, lng: longitude },
        map: map,
        title: 'Klicke um Informationen anzuzeigen!',
        icon: 'ressources/Icon_Kuh.png'
    });

    marker.addListener('click', function(e) {
        infowindow.open(map, marker);
    });

    var contentString = '<div id="content">' + // Text der in einem Popup angezeigt werden soll
        '<div id="siteNotice">' +
        '</div>' +
        '<h1 id="firstHeading" class="firstHeading">Kuh Berta&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</h1>' + // &nbsp; bedeutet ein Leerzeichen
        '<img alt="Temperatur" src="ressources/Temperatur_20.png" width="29" height="100" style="float:right;" >' +
        '<div id="bodyContent">' +
        '<p>Geschwindigkeit:' +
        '<p>Temperatur:' +
        '<p>Zustand:' +
        '</div>' +
        '</div>';

    infowindow = new google.maps.InfoWindow({ // Hier wird ein Popup für den Marker geöffnet
        content: contentString
    });

    Tier_marker.push(marker);
}

function erstelle_Weidezaun() {
    // Initialisiert das Polygon, das den virtuellen Weidezaun bildet
    var poly = new google.maps.Polygon({
        strokeColor: '#000000',
        strokeOpacity: 0.75,
        strokeWeight: 3,
        fillColor: '#90ff32',
        fillOpacity: 0.35,
        editable: true,
        draggableCursor: 'crosshair'
    });

    poly.addListener('click', function(e) {
        if (Loesche_Symbol == true) {
            if (e.vertex == undefined) {
                return;
            }
            var path = Weidezaeune[Weidezaunselector].getPath();
            path.removeAt(e.vertex);
        }
    });

    //Clickevent, wenn auf die Map geklickt wird, wird ein die Funktion zeichne_Symbol aufgerufen
    poly.addListener('click', zeichne_Symbol);
    poly.setMap(map);
    Weidezaeune.push(poly);
}

// erstellt eine Wasserstelle
function erstelle_Wasserstelle(event) {
    var marker = new google.maps.Marker({
        position: event.latLng,
        title: Wasserstelle_marker.length.toString(),
        map: map,
        icon: 'ressources/Wassertrog.png'
    });

    // wenn die Wasserstelle gelöscht werden soll
    marker.addListener('click', function() {
        if (Loesche_Symbol == true) {
            var Wasserstelle_id = parseInt(this.title);
            Wasserstelle_marker[Wasserstelle_id].setMap(null);
            Wasserstelle_marker[Wasserstelle_id] = undefined;
        }
    })

    Wasserstelle_marker.push(marker);
    marker.setMap(map);
}

setInterval(function() { // aktualisiert die Weidezaun Strichstärke, sodass gesehen wird, welcher selektiert wird
    if (Weidezaeune[Weidezaunselector] != undefined && Weidezaun == true) {
        if (Weidezaeune.length != 0 && Weidezaeune[Weidezaunselector].strokeWeight != 6) {
            Weidezaeune.forEach(element => {
                if (element != undefined) {
                    element.setOptions({ strokeWeight: 3, editable: false });
                }
            });
            Weidezaeune[Weidezaunselector].setOptions({ strokeWeight: 6, editable: true });
        }
    } else {
        if (Weidezaeune.length != 0) {
            Weidezaeune.forEach(element => {
                if (element != undefined) {
                    element.setOptions({ strokeWeight: 3, editable: false });
                }
            });
        }
    }
}, 100)

function erstelle_Polyline() { // erstellt den Pfad, dass das Vieh zurückgelegt hat
    var Pfad = new google.maps.Polyline({
        path: Viehpfaddaten,
        geodesic: true,
        strokeColor: '#FF9313',
        strokeOpacity: 0.9,
        strokeWeight: 4
    });
    Viehpfad.push(Pfad);
    Viehpfad[0].setMap(map);
}

function fuege_neues_Segment_zum_Viehpfad_hinzu() { // erstellt den Pfad, dass das Vieh zurückgelegt hat
    var Pfad = new google.maps.Polyline({
        path: Viehpfaddaten,
        geodesic: true,
        strokeColor: '#FF9313',
        strokeOpacity: 0.9,
        strokeWeight: 4
    });
    Viehpfad.push(Pfad);
    Viehpfad[0].setMap(map);
}


function lade_Daten() {
    ladeWasserstellen();
    ladeWeidezaun();
}

function ladeWasserstellen() {
    var Sammelarraylat, Sammelarraylng, laenge;

    async function ladeWasserstellelat() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/walatitude/0/-1');
        const data = await responce.json();
        Sammelarraylat = data.LRANGE;
        laenge = Sammelarraylat.length;
    }
    ladeWasserstellelat();
    async function ladeWasserstellelng() {
        const responce2 = await fetch('http://firmware.wz247.at:7379/LRANGE/walongitude/0/-1');
        const data2 = await responce2.json();
        Sammelarraylng = data2.LRANGE;
    }
    ladeWasserstellelng();

    setTimeout(function() {
        for (index = 0; index < laenge; index++) { // Funtion die für jedes geladene Wasserstellenkoordinatenpaar eine neue Wasserstelle hinzufügt
            var marker = new google.maps.Marker({
                position: { lat: parseFloat(Sammelarraylat[index]), lng: parseFloat(Sammelarraylng[index]) },
                title: Wasserstelle_marker.length.toString(),
                map: map,
                icon: 'ressources/Wassertrog.png'
            });

            // wenn die Wasserstelle gelöscht werden soll
            marker.addListener('click', function() {
                if (Loesche_Symbol == true) {
                    var Wasserstelle_id = parseInt(this.title);
                    Wasserstelle_marker[Wasserstelle_id].setMap(null);
                    Wasserstelle_marker[Wasserstelle_id] = undefined;
                }
            })
            Wasserstelle_marker.push(marker);
            marker.setMap(map);
        }
    }, 1000);
}

function ladeWeidezaun() {
    var Sammelarraylat, Sammelarraylng, Sammelarraycounter, laenge, bigestnumber;

    async function ladeWeidezaunlat() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/welatitude/0/-1');
        const data = await responce.json();
        Sammelarraylat = data.LRANGE;
        laenge = Sammelarraylat.length;
    }
    ladeWeidezaunlat();
    async function ladeWeidezaunlng() {
        const responce2 = await fetch('http://firmware.wz247.at:7379/LRANGE/welongitude/0/-1');
        const data2 = await responce2.json();
        Sammelarraylng = data2.LRANGE;
    }
    ladeWeidezaunlng();
    async function ladeWeidezaunzahl() {
        const responce3 = await fetch('http://firmware.wz247.at:7379/LRANGE/wezaunc/0/-1');
        const data3 = await responce3.json();
        Sammelarraycounter = data3.LRANGE;
    }
    ladeWeidezaunzahl();


    setTimeout(function() {
        bigestnumber = parseInt(Sammelarraycounter[0]);
        Sammelarraycounter.forEach(element => {
            if (bigestnumber < parseInt(element)) {
                bigestnumber = parseInt(element);
            }
        });
        for (index = 1; index <= bigestnumber; index++) { // Funtion die für jedes geladene Wasserstellenkoordinatenpaar eine neue Wasserstelle hinzufügt
            var Weidezaunkoordinaten = [];
            for (indey = 0; indey < laenge; indey++) {
                if (index == parseInt(Sammelarraycounter[indey])) {
                    Weidezaunkoordinaten.push({
                        lat: parseFloat(Sammelarraylat[indey]),
                        lng: parseFloat(Sammelarraylng[indey])
                    });
                }
            }
            var poly = new google.maps.Polygon({
                paths: Weidezaunkoordinaten,
                strokeColor: '#000000',
                strokeOpacity: 0.75,
                strokeWeight: 6,
                fillColor: '#90ff32',
                fillOpacity: 0.35,
                editable: true,
                draggableCursor: 'crosshair'
            });

            poly.addListener('click', function(e) {
                if (Loesche_Symbol == true) {
                    if (e.vertex == undefined) {
                        return;
                    }
                    var path = Weidezaeune[Weidezaunselector].getPath();
                    path.removeAt(e.vertex);
                }
            });

            //Clickevent, wenn auf die Map geklickt wird, wird ein die Funktion zeichne_Symbol aufgerufen
            poly.addListener('click', zeichne_Symbol);
            poly.setMap(map);
            Weidezaeune.push(poly);
            $('.dropdown-content').append( // fügt einen neuen Untermenüpunkt hinzu, sobald auf Neuer_Weidezaun geklickt wird.
                '<div id="' +
                index.toString() + // der Untermenüpukt trägt die ID mit dem Namennummer des Weidezauns, also Weidzaun1,...
                '" onClick="Weidezaunselektieren(this.id)">Weidezaun ' +
                index.toString() +
                '</div>');
        }
        Weidezaunselector = 1;
        Weidezaeune.forEach(element => {
            if (element != undefined) {
                element.setOptions({ strokeWeight: 3, editable: false });
            }
        });
        Weidezaeune[Weidezaunselector].setOptions({ strokeWeight: 6, editable: true });
    }, 1000);
}

function Aktualisiere_Viehpopup() {
    var Geschwindigkeit, Beschleunigungsereignis, Viehtemperatur, Datum = "heute",
        Zeit = "jetzt",
        Bildnummer = "0",
        Akku = 100;
    async function ladeGeschwindigkeit() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Geschwindigkeit/0/0');
        const data = await responce.json();
        Geschwindigkeit = data.LRANGE;
    }
    ladeGeschwindigkeit();
    async function ladeBeschleunigung() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Beschleunigungsereignis/0/0');
        const data = await responce.json();
        Beschleunigungsereignis = data.LRANGE;
    }
    ladeBeschleunigung();
    async function ladeTemperatur() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Temperatur/0/0');
        const data = await responce.json();
        Viehtemperatur = data.LRANGE;
    }
    ladeTemperatur();
    async function ladeDatum() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Datum/0/0');
        const data = await responce.json();
        Datum = data.LRANGE.toString();
    }
    ladeDatum();
    async function ladeZeit() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Zeit/0/0');
        const data = await responce.json();
        Zeit = data.LRANGE.toString();
    }
    ladeZeit();
    async function ladeAkkustand() {
        const responce = await fetch('http://firmware.wz247.at:7379/LRANGE/Akku/0/0');
        const data = await responce.json();
        Akku = data.LRANGE.toString();
    }
    ladeAkkustand();
    setTimeout(function() {
        if (Beschleunigungsereignis == 1) {
            Beschleunigungsereignis = "Schlagartige Bewegung";
        } else {
            Beschleunigungsereignis = "Ruhig und gelassen";
        }

        if (Viehtemperatur < 0) {
            Bildnummer = "0";
        }
        if (Viehtemperatur < 10 && Viehtemperatur >= 0) {
            Bildnummer = "10";
        }
        if (Viehtemperatur < 20 && Viehtemperatur >= 10) {
            Bildnummer = "20";
        }
        if (Viehtemperatur < 30 && Viehtemperatur >= 20) {
            Bildnummer = "30";
        }
        if (Viehtemperatur >= 40) {
            Bildnummer = "40";
        }

        var contentString = '<div id="content">' + // Text der in einem Popup angezeigt werden soll
            '<div id="siteNotice">' +
            '</div>' +
            '<h1 id="firstHeading" class="firstHeading">Kuh Berta&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</h1>' + // &nbsp; bedeutet ein Leerzeichen
            '<img alt="Temperatur" src="ressources/Temperatur_' + Bildnummer + '.png" width="29" height="100" style="float:right;" >' +
            '<div id="bodyContent">' +
            '<p>Geschwindigkeit: ' + Geschwindigkeit[0].toString() + 'm/s' +
            '<p>Temperatur: ' + Viehtemperatur[0].toString() + ' &deg;C' +
            '<p>Zustand: ' + Beschleunigungsereignis +
            '<p>' + Zeit.toString() + '&nbsp;&nbsp;' + Datum.toString() + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' + 'Akku: ' + Akku.toString() + '%' +
            '</div>' +
            '</div>';

        infowindow.setContent(contentString);
    }, 1000);
}

function Speichere_Wasserstellen() {
    async function deleteWasserstelle1() {
        const responce = await fetch('http://firmware.wz247.at:7379/del/walatitude/');
        const data = await responce.json();
    }
    deleteWasserstelle1();
    async function deleteWasserstelle2() {
        const responce = await fetch('http://firmware.wz247.at:7379/del/walongitude/');
        const data = await responce.json();
    }
    deleteWasserstelle2();
    for (index = 0; index < Wasserstelle_marker.length; index++) {
        if (Wasserstelle_marker[index] != undefined) {
            async function speichereWasserstellelat() {
                const responce = await fetch('http://firmware.wz247.at:7379/LPUSH/walatitude/' + Wasserstelle_marker[index].getPosition().lat().toString());
                const data = await responce.json();
            }
            speichereWasserstellelat();
            async function speichereWasserstellelng() {
                const responce = await fetch('http://firmware.wz247.at:7379/LPUSH/walongitude/' + Wasserstelle_marker[index].getPosition().lng().toString());
                const data = await responce.json();
            }
            speichereWasserstellelng();
        }
    }
}

function Speichere_Weidezauene() { // Funktion zum Speichern von Weidezäunen
    var Sendestringlat = "",
        Sendestringlng = "",
        Sendestringindex = "",
        Weidezaunindex = 0;
    async function deleteWeidezaunlat() { // Alle weidezaundaten werden zuerst gelöscht
        const responce = await fetch('http://firmware.wz247.at:7379/del/welatitude/');
        const data = await responce.json();
    }
    deleteWeidezaunlat();
    async function deleteWeidezaunlng() {
        const responce = await fetch('http://firmware.wz247.at:7379/del/welongitude/');
        const data = await responce.json();
    }
    deleteWeidezaunlng();
    async function deleteWeidezaunZahl() {
        const responce = await fetch('http://firmware.wz247.at:7379/del/wezaunc/');
        const data = await responce.json();
    }
    deleteWeidezaunZahl();
    for (index = 1; index < Weidezaeune.length; index++) {
        if (Weidezaeune[index] != undefined) {
            var path = Weidezaeune[index].getPath();
            if (path != undefined) {
                Weidezaunindex++;
                for (indey = 0; indey < path.length; indey++) {
                    Sendestringlat += "/" + path.getAt(indey).lat().toString();
                    Sendestringlng += "/" + path.getAt(indey).lng().toString();
                    Sendestringindex += "/" + Weidezaunindex.toString();
                }
            }
        }
    }
    async function speichereWeidezaunelat() {
        const responce = await fetch('http://firmware.wz247.at:7379/LPUSH/welatitude' + Sendestringlat);
        const data = await responce.json();
    }
    speichereWeidezaunelat();
    async function speichereWeidezaunelng() {
        const responce = await fetch('http://firmware.wz247.at:7379/LPUSH/welongitude' + Sendestringlng);
        const data = await responce.json();
    }
    speichereWeidezaunelng();
    async function speichereWeidezauneZahl() {
        const responce = await fetch('http://firmware.wz247.at:7379/LPUSH/wezaunc' + Sendestringindex);
        const data = await responce.json();
    }
    speichereWeidezauneZahl();
    setTimeout(function() {
        alert('Erfolgreich gespeichert!');
    }, 500);

}