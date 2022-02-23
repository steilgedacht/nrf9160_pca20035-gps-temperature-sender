#include <zephyr.h>
#include <net/socket.h>
#include <stdio.h>
#include <uart.h>
#include <string.h>

#include <nrf_socket.h>
#include <stdio.h>
#include <device.h>
#include <drivers/gpio.h>

#include <drivers/sensor.h>
#include <misc/printk.h>
#include <spi.h>
#include <gpio.h>
#include <kernel.h>

#include <math.h>

//
// Hier wird alles initialisiert
//

#define LED0_PORT DT_ALIAS_LED0_GPIOS_CONTROLLER // Für die Led, konfiguriert die PINS um sie später für die LED zu benutzen
#define LED0 DT_ALIAS_LED0_GPIOS_PIN
#define LED1_PORT DT_ALIAS_LED1_GPIOS_CONTROLLER
#define LED1 DT_ALIAS_LED1_GPIOS_PIN
#define LED2_PORT DT_ALIAS_LED2_GPIOS_CONTROLLER
#define LED2 DT_ALIAS_LED2_GPIOS_PIN

#define AT_XSYSTEMMODE "AT\%XSYSTEMMODE=0,0,1,0" // AT Befehle, die im Verlauf des Programms ausgeführt werden, um mit ihnen den Systemmode zu ändern
#define AT_CFUN "AT+CFUN=1"
#define AT_CFUN4 "AT+CFUN=4"
#define AT_CEREG "AT+CEREG?"
#ifdef CONFIG_BOARD_NRF9160_PCA10090NS
#define AT_MAGPIO "AT\%XMAGPIO=1,0,0,1,1,1574,1577"
#define AT_COEX0 "AT\%XCOEX0=1,1,1570,1580"
#endif
static const char at_commands[][31] = { AT_CFUN4, AT_XSYSTEMMODE, // Reihenfolge der AT Befehle
#ifdef CONFIG_BOARD_NRF9160_PCA10090NS
					AT_MAGPIO, AT_COEX0,
#endif
					AT_CFUN };

static const char at_commands10[][31] = { AT_CEREG};
static int fd; // Verschiedene Variablen, die für das GPS gebraucht werden.
static char nmea_strings[10][NRF_GNSS_NMEA_MAX_LEN];
static u32_t nmea_string_cnt;
static bool got_first_fix;
static bool update_terminal;
static u64_t fix_timestamp;
nrf_gnss_data_frame_t last_fix;
nrf_gnss_data_frame_t gps_data;
float longitude = 0.0, latitude = 0.0, altitude = 0.0;
char time_and_date[] = "";

#define PORT 9160 // Für die NBIOT Verbindung zum Server
#define IPADDR "46.101.135.70"

static int at_sock; // Ein socket, der die AT Befele Ausführen wird.
int bytes_sent; // weitere Variablen für die AT Befehle
int bytes_received;
char buf[2];
static u8_t at_command1[256] = "AT+CFUN=4\r\n";
static u8_t at_command2[256] = "AT+CFUN=1\r\n";
static u8_t at_command3[256] = "AT%XSYSTEMMODE=0,1,0,0\r\n";
static u8_t at_command4[256] = "AT%XSYSTEMMODE=0,0,1,0\r\n";
static u8_t at_command5[256] = "AT%XSYSTEMMODE?\r\n";
static u8_t at_command0[256] =
	"AT+CGDCONT=0,\"IP\",\"m2m.nbiot.t-mobile.at\"\r\n";
static char result[256];


char Ubertrager;

s64_t time_stamp; // Für Debug Vorgänge, um das GPS zu überspringen
s64_t time_stamp2;
struct device *dev[3]; // Für die LEDs, um diese anzusprechen, dass jedes sein eigenes Device bekommt.

K_SEM_DEFINE(sem, 0, 1); // für den Beschleunigungssensor
#define cs_controller DT_NORDIC_NRF_SPI_SPI_3_CS_GPIOS_CONTROLLER_0
#define cd_pin DT_NORDIC_NRF_SPI_0_CS_GPIOS_PIN_0

struct device *spi_dev;
struct device *cs_gpio;

struct sensor_value accel[3];
struct device *devaccel;

// Datenobjket für das Senden
struct Daten
{
	float latitude;
    float longitude;
    float Geschwindigkeit;
	int Beschleunigungsereignis;
    int Temperatur;
	int Akku;
};
struct Daten Sendedaten;

//
// AT Befehlsfunktionen
//

void APN_setzen() // Funktion um über AT Befehle die APN zu ändern
{
	bytes_sent = send(at_sock, at_command0, strlen(at_command0), 0);
	if (bytes_sent != strlen(at_command0)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command0), bytes_sent);
	}
}
void ATCFUN4() // Funkton, um den AT Befehl AT_CFUN = 4 auszuführen
{
	bytes_sent = send(at_sock, at_command1, strlen(at_command1), 0);
	if (bytes_sent != strlen(at_command1)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command1), bytes_sent);
	}
	bytes_received = recv(at_sock, result, sizeof(result), 0);
}
void ATCFUN1() // Funkton, um den AT Befehl AT_CFUN = 1 auszuführen
{
	bytes_sent = send(at_sock, at_command2, strlen(at_command2), 0);
	if (bytes_sent != strlen(at_command2)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command2), bytes_sent);
	}
	bytes_received = recv(at_sock, result, sizeof(result), 0);
}

void NBIoT_Mode() // Funkton, um in den NBIot Mode zu wechseln
{
	ATCFUN4();
	k_sleep(500);
	bytes_sent = send(at_sock, at_command3, strlen(at_command3), 0);
	if (bytes_sent != strlen(at_command3)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command3), bytes_sent);
	}
	bytes_received = recv(at_sock, result, sizeof(result), 0);
	ATCFUN1();
}

void GPS_Mode()// Funkton, um in den GPS Mode zu wechseln
{
	ATCFUN4();
	k_sleep(500);
	bytes_sent = send(at_sock, at_command4, strlen(at_command4), 0);
	if (bytes_sent != strlen(at_command4)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command4), bytes_sent);
	}
	bytes_received = recv(at_sock, result, sizeof(result), 0);
	ATCFUN1();
}

void ATSYSMODE()// Funkton, um den Mode zu prüfen und auszulesen
{
	bytes_sent = send(at_sock, at_command5, strlen(at_command5), 0);
	if (bytes_sent != strlen(at_command5)) {
		printk("Failed to send AT command,should send %d bytes. Bytes sent is %d\n",
		       strlen(at_command5), bytes_sent);
	}
	bytes_received = recv(at_sock, result, sizeof(result), 0);
	printk("RECEIVED FROM recv(): %s\n", result);
}

//
// Verbindungsfunktionen
//

int blocking_send(int fd, u8_t *buf, u32_t size, u32_t flags) // Funktion, für die Serververbindung
{
	int err;

	do {
		err = send(fd, buf, size, flags);
	} while (err < 0 && errno == EAGAIN);

	return err;
}

int blocking_connect(int fd, struct sockaddr *local_addr, socklen_t len) // Funktion, für die Serververbindung
{
	int err;

	do {
		err = connect(fd, local_addr, len);
	} while (err < 0 && errno == EAGAIN);

	return err;
}

int connect_to_server(void) // Funktion, für die Serververbindung, beinhaltet den kompletten Verbindungsprozess
{
	struct sockaddr_in local_addr;
	struct addrinfo *res;

	local_addr.sin_family = AF_INET;
	local_addr.sin_port = htons(0);
	local_addr.sin_addr.s_addr = 0;

	printk("HTTP example\n\r");
	int err = getaddrinfo(IPADDR, NULL, NULL, &res);

	printk("getaddrinfo err: %d\n\r", err);
	((struct sockaddr_in *)res->ai_addr)->sin_port = htons(PORT);

	printk("Lebenszeichen 4.3\n");
	int client_fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);

	printk("client_fd: %d\n\r", client_fd);

	err = bind(client_fd, (struct sockaddr *)&local_addr,
		   sizeof(local_addr));
	printk("bind err: %d\n\r", err);
	err = blocking_connect(client_fd, (struct sockaddr *)res->ai_addr,
			       sizeof(struct sockaddr_in));
	printk("connect err: %d\n\r", err);

	return client_fd;
}

//
// GPS Funktionen
//

void bsd_recoverable_error_handler(uint32_t error)
{
	printf("Err: %lu\n", (unsigned long)error);
}

static int enable_gps(void) // Funktion um über AT Befehl, GPS zu Aktivieren
{
	for (int i = 0; i < ARRAY_SIZE(at_commands); i++) {
		bytes_sent = send(at_sock, at_commands[i],
				  strlen(at_commands[i]), 0);

		if (bytes_sent < 0) {
			close(at_sock);
			return -1;
		}

		do {
			bytes_received = recv(at_sock, buf, 2, 0);
		} while (bytes_received == 0);

		if (memcmp(buf, "OK", 2) != 0) {
			close(at_sock);
			return -1;
		}
	}

	return 0;
}

static int init_app(void) // Setzt das System für GPS auf.
{
	int retval;

	nrf_gnss_fix_retry_t fix_retry = 0;
	nrf_gnss_fix_interval_t fix_interval = 1;
	nrf_gnss_delete_mask_t delete_mask = 0;
	nrf_gnss_nmea_mask_t nmea_mask =
		NRF_GNSS_NMEA_GSV_MASK | NRF_GNSS_NMEA_GSA_MASK |
		NRF_GNSS_NMEA_GLL_MASK | NRF_GNSS_NMEA_GGA_MASK |
		NRF_GNSS_NMEA_RMC_MASK;

	if (enable_gps() != 0) {
		printk("Failed to enable GPS\n");
		return -1;
	}

	fd = nrf_socket(NRF_AF_LOCAL, NRF_SOCK_DGRAM, NRF_PROTO_GNSS);

	if (fd >= 0) {
		printk("Socket created\n");
	} else {
		printk("Could not init socket (err: %d)\n", fd);
		return -1;
	}

	retval = nrf_setsockopt(fd, NRF_SOL_GNSS, NRF_SO_GNSS_FIX_RETRY,
				&fix_retry, sizeof(fix_retry));

	if (retval != 0) {
		printk("Failed to set fix retry value\n");
		return -1;
	}

	retval = nrf_setsockopt(fd, NRF_SOL_GNSS, NRF_SO_GNSS_FIX_INTERVAL,
				&fix_interval, sizeof(fix_interval));

	if (retval != 0) {
		printk("Failed to set fix interval value\n");
		return -1;
	}

	retval = nrf_setsockopt(fd, NRF_SOL_GNSS, NRF_SO_GNSS_NMEA_MASK,
				&nmea_mask, sizeof(nmea_mask));

	if (retval != 0) {
		printk("Failed to set nmea mask\n");
		return -1;
	}

	retval = nrf_setsockopt(fd, NRF_SOL_GNSS, NRF_SO_GNSS_START,
				&delete_mask, sizeof(delete_mask));

	if (retval != 0) {
		printk("Failed to start GPS\n");
		return -1;
	}

	return 0;
}
int blinke_an_aus = 0;
void blinke_rot(){
	if(blinke_an_aus == 0){
		gpio_pin_write(dev[0], LED0, 1);
		blinke_an_aus = 1;
	}
	else
	{
		gpio_pin_write(dev[0], LED0, 0);
		blinke_an_aus = 0;
	}
	
}
void blinke_violett(){
	if(blinke_an_aus == 0){
		gpio_pin_write(dev[0], LED0, 1);
		gpio_pin_write(dev[2], LED2, 1);
		blinke_an_aus = 1;
	}
	else
	{
		gpio_pin_write(dev[0], LED0, 0);
		gpio_pin_write(dev[2], LED2, 1);
		blinke_an_aus = 0;
	}
	
}
static void print_satellite_stats(nrf_gnss_data_frame_t *pvt_data) // Während er nach Satteliten sucht
{
	u8_t tracked = 0;
	u8_t in_fix = 0;
	u8_t unhealthy = 0;

	for (int i = 0; i < NRF_GNSS_MAX_SATELLITES; ++i) {
		if ((pvt_data->pvt.sv[i].sv > 0) &&
		    (pvt_data->pvt.sv[i].sv < 33)) {
			tracked++;

			if (pvt_data->pvt.sv[i].flags &
			    NRF_GNSS_SV_FLAG_USED_IN_FIX) {
				in_fix++;
			}

			if (pvt_data->pvt.sv[i].flags &
			    NRF_GNSS_SV_FLAG_UNHEALTHY) {
				unhealthy++;
			}
		}
	}

	if (tracked != 0) {
		if(tracked > 1){
			blinke_rot();
		}
		else
		{
			gpio_pin_write(dev[0], LED0, 1);
		}
	} else {
		gpio_pin_write(dev[0], LED0, 0);
	}
	if (in_fix != 0) {
		gpio_pin_write(dev[1], LED1, 1);
	} else {
		gpio_pin_write(dev[1], LED1, 0);
	}

	printk("Tracking: %d Using: %d Unhealthy: %d", tracked, in_fix,
	       unhealthy);

	printk("\nSeconds since last fix %lld\n",
	       (k_uptime_get() - fix_timestamp) / 1000);
}

static void print_pvt_data(nrf_gnss_data_frame_t *pvt_data) // Hat er einen Sattelliten gefunden, so gibt er hier die nötigen Werte aus.
{
	printf("Longitude:  %f\n", pvt_data->pvt.longitude);
	printf("Latitude:   %f\n", pvt_data->pvt.latitude);
	/*	printf("Altitude:   %f\n", pvt_data->pvt.altitude);
	printf("Speed:      %f\n", pvt_data->pvt.speed);
	printf("Heading:    %f\n", pvt_data->pvt.heading);
	printk("Date:       %02u-%02u-%02u\n", pvt_data->pvt.datetime.day,
					       pvt_data->pvt.datetime.month,
					       pvt_data->pvt.datetime.year);
	printk("Time (UTC): %02u:%02u:%02u\n", pvt_data->pvt.datetime.hour,
					       pvt_data->pvt.datetime.minute,
					      pvt_data->pvt.datetime.seconds);*/
	// printk("\n\n\n");
	longitude = pvt_data->pvt.longitude;
	latitude = pvt_data->pvt.latitude;
	altitude = pvt_data->pvt.altitude;
	/*
	time_and_date[0] = "%02u-%02u-%02u_%02u:%02u:%02u\n", pvt_data->pvt.datetime.day,
					       pvt_data->pvt.datetime.month,
					       pvt_data->pvt.datetime.year, 
                                               pvt_data->pvt.datetime.hour,
					       pvt_data->pvt.datetime.minute,
					       pvt_data->pvt.datetime.seconds;*/

	//  printk(time_and_date[0]);
	printk("\n\n\n");
}

static void print_nmea_data(void) // hier würde er die nmea daten ausgeben
{
	printk("NMEA strings:\n");

	for (int i = 0; i < nmea_string_cnt; ++i) {
		printk("%s\n", nmea_strings[i]);
	}
}

int process_gps_data(nrf_gnss_data_frame_t *gps_data)
{
	int retval;

	retval = nrf_recv(fd, gps_data, sizeof(nrf_gnss_data_frame_t),
			  NRF_MSG_DONTWAIT);

	if (retval > 0) {
		switch (gps_data->data_id) {
		case NRF_GNSS_PVT_DATA_ID:

			if ((gps_data->pvt.flags &
			     NRF_GNSS_PVT_FLAG_FIX_VALID_BIT) ==
			    NRF_GNSS_PVT_FLAG_FIX_VALID_BIT) {
				if (!got_first_fix) {
					got_first_fix = true;
				}

				fix_timestamp = k_uptime_get();
				memcpy(&last_fix, gps_data,
				       sizeof(nrf_gnss_data_frame_t));

				nmea_string_cnt = 0;
				update_terminal = true;
			}
			break;

		case NRF_GNSS_NMEA_DATA_ID:
			if (nmea_string_cnt < 10) {
				memcpy(nmea_strings[nmea_string_cnt++],
				       gps_data->nmea, retval);
			}
			break;

		default:
			break;
		}
	}

	return retval;
}

//
// Beschleunigungssensor Funktionen
//

static const struct spi_config spi_cfg = {
	.operation = SPI_WORD_SET(8) | SPI_TRANSFER_MSB,
	.frequency = 8000000,
	.slave = 0,
};

static void spi_init(void)
{
	const char *const spiName = "SPI_3";
	spi_dev = device_get_binding(spiName);

	if (spi_dev == NULL) {
		printk("Could not get %s device\n", spiName);
		return;
	}
}

void cs_setup(void)
{
	cs_gpio = device_get_binding(cs_controller);

	if (cs_gpio == NULL) {
		printk("Could not get gpio device\n");
		return;
	}

	/* Set cs pin as output */
	gpio_pin_configure(cs_gpio, cd_pin, GPIO_DIR_OUT);

	gpio_pin_write(cs_gpio, cd_pin, 1);
}

void lese_register(u8_t leseregister)
{
	u8_t cmd = 0x0B;
	u8_t reg_addr = leseregister; // zu lesendes Register
	u8_t value = 0x00;
	void *data = &value;
	int length = 1;
	u8_t access[2] = { cmd, reg_addr };

	gpio_pin_write(cs_gpio, cd_pin, 0);

	const struct spi_buf buf[2] = { { .buf = access, .len = 2 },
					{ .buf = data, .len = length } };
	struct spi_buf_set tx = {
		.buffers = buf,
	};

	const struct spi_buf_set rx = { .buffers = buf, .count = 2 };

	tx.count = 1;

	int spi_result = spi_transceive(spi_dev, &spi_cfg, &tx, &rx);

	printk("Value: %02X\n", value);

	printk("Here: %d \n\n", (int)value);

	gpio_pin_write(cs_gpio, cd_pin, 1);
}

void schreibe_register(u8_t schreibregister, u8_t wert)
{
	u8_t cmd = 0x0A;
	u8_t reg_addr = schreibregister; // zu schreibendes Register
	u8_t value = wert; // zu schreibenede Wert
	void *data = &value;
	int length = 1;
	u8_t access[3] = { cmd, reg_addr, value };

	gpio_pin_write(cs_gpio, cd_pin, 0);

	const struct spi_buf buf[2] = { { .buf = access, .len = 3 },
					{ .buf = data, .len = length } };
	struct spi_buf_set tx = {
		.buffers = buf,
	};

	const struct spi_buf_set rx = { .buffers = buf, .count = 2 };

	tx.count = 1;

	int spi_result = spi_transceive(spi_dev, &spi_cfg, &tx, &rx);

	// printk("SPI result: %d\n",spi_result);
	printk("Value: 0x%02X\n", value);

	gpio_pin_write(cs_gpio, cd_pin, 1);
}

static void trigger_handler(struct device *dev, struct sensor_trigger *trig)
{
	switch (trig->type) {
	case SENSOR_TRIG_DATA_READY:
		if (sensor_sample_fetch(dev) < 0) {
			printf("Sample fetch error\n");
			return;
		}
		k_sem_give(&sem);
		break;
	case SENSOR_TRIG_THRESHOLD:
		Sendedaten.Beschleunigungsereignis = 1;
		printf("Threshold trigger\n");
		break;
	default:
		printf("Unknown trigger\n");
	}
}

void fertigesGPS(nrf_gnss_data_frame_t *pvt_data){
	Sendedaten.longitude = pvt_data->pvt.longitude; 
	Sendedaten.latitude = pvt_data->pvt.latitude;
}


//
// Hauptteil der Software
//

static int Schon_verbunden(int a){
        char buff[15];
	for (int i = 0; i < ARRAY_SIZE(at_commands10); i++) {
		bytes_sent = send(at_sock, at_commands10[i],
				  strlen(at_commands10[i]), 0);

		if (bytes_sent < 0) {
			close(at_sock);
			return -1;
		}

		do {
			bytes_received = recv(at_sock, buff, 15, 0);
		} while (bytes_received == 0);

		
	}
        
	char *ptr = strtok(buff, ",");
	ptr = strtok(NULL, ",");
	printf("%s  %s \n", ptr, buff);
        if(a > 10){
        if(atoi(ptr) == 5){ // Bei 5 ist der Thingy verbunden.
                printf("angekommen");
                return 1;
        }
        }
        return 0;
}

void senden() // In dieser Funktion erhält er die GPS daten, Wandelt sie in einen String um, wechselt in den NBIOT Mode und sendet sie an den Server
{
	// hier werden die Variablen des Objekts Sendedaten zu einem String zusammengeführt
	char Daten[33];
	char longitude[33];
	char Geschwindigkeit[33];
	char Beschleunigunsereignis[33];
	char Temperatur[33];
	char Akku[33];
		
	snprintf(Daten, 33, "%f", Sendedaten.latitude);
	snprintf(longitude, 33, "%f", Sendedaten.longitude);//verwandelt in float in einen String
	snprintf(Geschwindigkeit, 33, "%.2f", Sendedaten.Geschwindigkeit);
	snprintf(Beschleunigunsereignis, 33, "%d", Sendedaten.Beschleunigungsereignis);
	snprintf(Temperatur, 33, "%d", Sendedaten.Temperatur);
	snprintf(Akku, 33, "%d", Sendedaten.Akku);
	strcat(Daten, ","); // H�ngt ein , dazwischen dran
	strcat(Daten, longitude); // H�ngt noch den zweiten output, also die longitude an den String
	strcat(Daten, ",");
	strcat(Daten, Geschwindigkeit);
	strcat(Daten, ",");
	strcat(Daten, Beschleunigunsereignis);
	strcat(Daten, ",");
	strcat(Daten, Temperatur);
	strcat(Daten, ",");
	strcat(Daten, Akku);
	printk("%s\n", Daten);

	printk("Lebenszeichen %s\n",Daten);
	gpio_pin_write(dev[2], LED2, 1); // Die LED wird gesetzt, damit man wei�, dass gesendet wird
	NBIoT_Mode(); // Dann wird in den NB-Iot Mode gewechselt
	ATSYSMODE(); // F�r Debug ger�nde wird kontrolliert
	APN_setzen(); // Dann wird sofort die APN gesetzt, da standardm��ig eine andere gesetzt ist.

	printk("Lebenszeichen 4    %s  \n", Daten); // Ausdebug gr�nden

        int verbunden = 0;
        int i = 0;
	while (verbunden == 0){// Der Thingy muss sich jetzt erst einmal mit dem NB-Iot Netzwerk verbinden, daf�r bekommt er eine halbe Minute bis eine Minute Zeit
		i++;
                k_sleep(200);
                verbunden = Schon_verbunden(i);
	}
	k_sleep(500);
	int fd2 = connect_to_server(); // Es wird sich mit dem Server verbunden
	int err = blocking_send(fd2, Daten, sizeof(Daten), 0); // Es wird der zuvor aufbereitete String gesendet.
	printk("Send err: %d", err); // Falls etwas schwief l�uft
	printk("Lebenszeichen 7\n"); // F�r debug vorg�nge
	gpio_pin_write(dev[2], LED2, 0);
    for(int i=0; i<3; i++) {
		gpio_pin_write(dev[1], LED1, 1);
        k_sleep(1000);
    }
	gpio_pin_write(dev[1], LED1, 0);
    time_stamp = k_uptime_get();

}

void initialisieren(){
	// AT socket wird initialisert. Dieser wird für die AT Befehle benötigt
	at_sock = socket(AF_LTE, 0, NPROTO_AT);
	if (at_sock < 0) {
		printf("AT_Socket initialisieren fehlgeschlagen!");
	}

	// Die verschiedenen LED Ports werden an verschiedene Devices gebunden, sodass sie später angesprochen werden können
	dev[0] = device_get_binding(LED0_PORT);
	dev[1] = device_get_binding(LED1_PORT);
	dev[2] = device_get_binding(LED2_PORT);

	gpio_pin_configure(dev[0], LED0, GPIO_DIR_OUT);
	gpio_pin_configure(dev[1], LED1, GPIO_DIR_OUT);
	gpio_pin_configure(dev[2], LED2, GPIO_DIR_OUT);

	// GPS wird initialisiert
	
	printk("Staring new GPS application\n");

	if (init_app() != 0) {
		return -1;
	}

	printk("Getting GPS data...\n");

	// Beschleunigungssensor wird initialisiert

	devaccel = device_get_binding(DT_INST_0_ADI_ADXL362_LABEL);
	if (devaccel == NULL) {
		printf("Device get binding device\n");
		return;
	}

	if (IS_ENABLED(CONFIG_ADXL362_TRIGGER)) {
		struct sensor_trigger trig = { .chan = SENSOR_CHAN_ACCEL_XYZ };

		trig.type = SENSOR_TRIG_THRESHOLD;
		if (sensor_trigger_set(devaccel, &trig, trigger_handler)) {
			printf("Trigger set error\n");
			return;
		}

		trig.type = SENSOR_TRIG_DATA_READY;
		if (sensor_trigger_set(devaccel, &trig, trigger_handler)) {
			printf("Trigger set error\n");
		}
	}
}

void suche_und_lese_GPS(){
	time_stamp = k_uptime_get(); // für debug vorgänge
	int gefunden = 1;
	while (gefunden == 1) {
		printk("Lebenszeichen 2.1");
		do {
		} while (process_gps_data(&gps_data) > 0);

		if (!got_first_fix) {
			print_satellite_stats(&gps_data);
		}

		if (((k_uptime_get() - fix_timestamp) >= 1) &&
		    (got_first_fix)) {
			printk("\033[1;1H");
			printk("\033[2J");

			print_satellite_stats(&gps_data);

			printk("---------------------------------\n");
			print_pvt_data(&last_fix);
			printk("\n");
			//print_nmea_data();
			printk("---------------------------------");

			update_terminal = false;
			fertigesGPS(&last_fix);
			gefunden = 0;
		}

		k_sleep(K_MSEC(500));
		time_stamp2=k_uptime_get(); // F�r Debug vorg�nge, um das GPS zu �berspringen nach 6 Sekunden
		if (time_stamp2-time_stamp> 6000){
			//gefunden = 0;
		}  
	}
}

void Geschwindigkeit_integrieren(){
	gpio_pin_write(dev[2], LED2, 1);
	gpio_pin_write(dev[0], LED0, 1);
	float Durchschnitt_Geschwindigkeit = 0, Counter = 0, Korrekturvektorgewicht = 0.1, Betrag_der_gemessenen_Beschleunigung;

	float Beschleunigungswerte[] = {0.0, 0.0, 0.0};
	float Korrekturvektor[] = {0.0, 0.0, -9.0}; // x,y,z Komponenten des vektors
	float korriegierter_Beschleunigungsvektor[] = {0.0, 0.0, 0.0}; // Beschleunigungsvektor ohne Erdbeschleunigung
    float Geschwindigkeitskompontnenten[] = {0.0, 0.0, 0.0};

	float Anfangszeit, Endzeit, Deltazeit;

	s64_t Zeitstempel_anfang = k_uptime_get();
	s64_t Zeitstempel_ende = k_uptime_get();

	while ((Zeitstempel_ende-Zeitstempel_anfang)<60000) { // misst 60 Sekunden lang
		if (IS_ENABLED(CONFIG_ADXL362_TRIGGER)) {
			k_sem_take(&sem, K_FOREVER);
		} else {
			k_sleep(K_MSEC(1000));
			if (sensor_sample_fetch(devaccel) < 0) {
				printf("Sample fetch error\n");
				return;
			}
		}

		if (sensor_channel_get(devaccel, SENSOR_CHAN_ACCEL_X, &accel[0]) < 0) {
			printf("Channel get error\n");
			return;
		}

		if (sensor_channel_get(devaccel, SENSOR_CHAN_ACCEL_Y, &accel[1]) < 0) {
			printf("Channel get error\n");
			return;
		}

		if (sensor_channel_get(devaccel, SENSOR_CHAN_ACCEL_Z, &accel[2]) < 0) {
			printf("Channel get error\n");
			return;
		}
		Beschleunigungswerte[0] = sensor_value_to_double(&accel[0]);
		Beschleunigungswerte[1] = sensor_value_to_double(&accel[1]);
		Beschleunigungswerte[2] = sensor_value_to_double(&accel[2]);
        Betrag_der_gemessenen_Beschleunigung = sqrt(Beschleunigungswerte[0]*Beschleunigungswerte[0]+ Beschleunigungswerte[1]*Beschleunigungswerte[1]+Beschleunigungswerte[2]*Beschleunigungswerte[2]);

		if(Betrag_der_gemessenen_Beschleunigung > 7.0 && Betrag_der_gemessenen_Beschleunigung < 10.0){ //falls fast keine Beschleunigung vorliegen sollte, also der Betrag zwischen 7 und 10 ist, erst dann soll der Beschleunigungsvektor berechnet werden.
			Korrekturvektor[0] += (Beschleunigungswerte[0]-Korrekturvektor[0]) * Korrekturvektorgewicht;
			Korrekturvektor[1] += (Beschleunigungswerte[1]-Korrekturvektor[1]) * Korrekturvektorgewicht;
			Korrekturvektor[2] += (Beschleunigungswerte[2]-Korrekturvektor[2]) * Korrekturvektorgewicht;
        }

		korriegierter_Beschleunigungsvektor[0] = Beschleunigungswerte[0] - Korrekturvektor[0];
		korriegierter_Beschleunigungsvektor[1] = Beschleunigungswerte[1] - Korrekturvektor[1];
		korriegierter_Beschleunigungsvektor[2] = Beschleunigungswerte[2] - Korrekturvektor[2];
		if((Zeitstempel_ende-Zeitstempel_anfang)<30000){ // startet, sobald der Koorekturvektor nach 30 Sekunden einen brauchbaren Wert angenommen hat und der korrigierte Wert integriert werden kann.
            k_sleep(1000);
    	    Anfangszeit= k_uptime_get();
        }
        else{ // Hier wird dann die korrigierte Beschleunigung zur Geschwindigkeit aufintegriert
			k_sleep(100);
            Endzeit= k_uptime_get();
            Deltazeit = (Endzeit-Anfangszeit)/1000; // die Zeit seit dem letzten Beschleunigungswert soll berechnet werden, um später mit diesem Wert zu Integrieren.

            Geschwindigkeitskompontnenten[0] += korriegierter_Beschleunigungsvektor[0]*Deltazeit; // Hier wird integriert und aufsummiert, sodass man die Geschwindigkeit erhaltet
            Geschwindigkeitskompontnenten[1] += korriegierter_Beschleunigungsvektor[1]*Deltazeit;
            Geschwindigkeitskompontnenten[2] += korriegierter_Beschleunigungsvektor[2]*Deltazeit;

            Geschwindigkeitskompontnenten[0] *= 0.95; // Da die Integration nicht 100% genau ist und der Sensor sich auf ein Geschwindigkeitslevel hinintegrieren kann, wird dieses hier langsam wieder auf 0 gezogen.
            Geschwindigkeitskompontnenten[1] *= 0.95;
            Geschwindigkeitskompontnenten[2] *= 0.95;
            
			Counter++;
			Durchschnitt_Geschwindigkeit += sqrt(pow(Geschwindigkeitskompontnenten[0],2) + pow(Geschwindigkeitskompontnenten[1],2) + pow(Geschwindigkeitskompontnenten[2],2));

            printf("Geschwindigkeit: %.6f \n", Durchschnitt_Geschwindigkeit/Counter);
            Anfangszeit = k_uptime_get();
        }
		Zeitstempel_ende = k_uptime_get();

	}
	Sendedaten.Geschwindigkeit = round(Durchschnitt_Geschwindigkeit/Counter*100)/100; // Die Durschnittliche Geschwindigkeit wird berechnet.
	gpio_pin_write(dev[2], LED2, 0);
	gpio_pin_write(dev[0], LED0, 0);
}

void messe_Temperatur(){
	// vorläufig für den Thingy
	struct device *devtemp = device_get_binding(DT_INST_0_BOSCH_BME680_LABEL);
	struct sensor_value temp;
	sensor_sample_fetch(devtemp);
	sensor_channel_get(devtemp, SENSOR_CHAN_AMBIENT_TEMP, &temp);
	Sendedaten.Temperatur = temp.val1;
	printf("T: %d\n", temp.val1);
	// Hier kommt dann noch das messen des Analog outputs hin
}

void Setze_Variablen_zuruck(){
	Sendedaten.latitude = latitude;
	Sendedaten.longitude = longitude;
	Sendedaten.Geschwindigkeit = 0.0;
	Sendedaten.Beschleunigungsereignis = 0;
	Sendedaten.Temperatur = 0;
	Sendedaten.Akku = 98;
}
/*
void close_sockets(){
	close(fd);
	close(retval);
}*/

int main(void)
{
	initialisieren();
	while (1)
	{
		Setze_Variablen_zuruck();
		printk("Lebenszeichen 1");
		Geschwindigkeit_integrieren();
		printk("Lebenszeichen 2");
		suche_und_lese_GPS();
		messe_Temperatur();
		Sendedaten.Akku = 98;
		//messe_Akku();
		senden();
                sys_reboot();  
	}
	
	return 0;
}