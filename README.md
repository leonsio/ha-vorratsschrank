# Vorratsschrank für Home Assistant

Lovelace-Karte für den [Barcode-Vorratsschrank auf dem Raspberry Pi](https://github.com/leonsio/Vorratsschrank). Sie zeigt Produktbilder, Namen, Stückzahlen, Kategorien und Mindesthaltbarkeitsdaten. Auf der Karte kannst du Stücke ein- und ausbuchen, Namen und MHD ändern und den Bestand eines Produkts in einer Kategorie löschen. SQLite auf dem Pi bleibt die gemeinsame Datenbasis für Touchdisplay und Home Assistant.

## 1. Raspberry Pi vorbereiten

Den [Vorratsschrank-Dienst aktualisieren](https://github.com/leonsio/Vorratsschrank#vorhandene-installation-aktualisieren). Für **Produktdaten und Bild aktualisieren** und **Kategorie wechseln** wird der entsprechend aktualisierte Pi-Dienst benötigt. Die Schreib-API ist ab Commit [91cdb6e](https://github.com/leonsio/Vorratsschrank/commit/91cdb6ea71da41d7fa76131b4895905e37f46b9c) enthalten. In `/etc/barcode-vorrat/config.json` den vorhandenen Abschnitt `rest` anpassen:

```json
"rest": {
  "enabled": true,
  "host": "0.0.0.0",
  "port": 8765,
  "token": "HIER-EIN-LANGES-ZUFAELLIGES-TOKEN-EINTRAGEN",
  "public_images": false
}
```

Dann `sudo systemctl restart barcode-vorrat` ausführen. Home Assistant muss den Pi auf Port 8765 erreichen. Der REST-Port ist für das lokale Netz vorgesehen. Öffentliche Produktbilder sind für die Karte entbehrlich. Home Assistant ruft die Bilder mit dem REST-Token ab und liefert sie an die angemeldete Karte.

## 2. Über HACS installieren

1. In **HACS → ⋮ → Benutzerdefinierte Repositories** dieses Repository mit Kategorie **Integration** hinzufügen.
2. **Vorratsschrank** herunterladen und Home Assistant neu starten.
3. Unter **Einstellungen → Geräte & Dienste → Integration hinzufügen** nach **Vorratsschrank** suchen. Die Pi-Adresse (z. B. `http://192.168.1.42:8765`) und das REST-Token eingeben.

## 3. Lovelace-Karte hinzufügen

Unter **Einstellungen → Dashboards → ⋮ → Ressourcen** folgende Ressource vom Typ **JavaScript-Modul** hinzufügen:

```text
/vorratsschrank_static/vorratsschrank-card.js
```

Falls **Ressourcen** fehlt, den erweiterten Modus im HA-Benutzerprofil einschalten. In einem YAML-Dashboard die Ressource stattdessen im YAML-Ressourcenabschnitt registrieren. Danach das Dashboard neu laden und die Karte **Vorratsschrank** hinzufügen oder diese Kartenkonfiguration verwenden:

```yaml
type: custom:vorratsschrank-card
title: Vorratsschrank
```

Bei mehreren Raspberry Pis lässt sich optional mit `entry_id` die gewünschte Home-Assistant-Konfigurations-ID angeben. Ohne diese Angabe verwendet die Karte den ersten eingerichteten Vorratsschrank. Alle angemeldeten Home-Assistant-Benutzer können den Bestand über die Karte bearbeiten.

## Bestand verwalten

Die Suche findet Produkte nach Name, Marke oder EAN und lässt sich mit dem Kategoriefilter kombinieren. Tippe auf einen Produktnamen, um die Produktsuche im Hintergrund erneut anzustoßen oder alle Stücke der aktuellen Zeile samt MHD in eine andere Kategorie zu verschieben.

## Mit dem iPhone einbuchen

1. Die Karte in Safari oder der Home-Assistant-App öffnen. **Barcode fotografieren** wählen. iOS öffnet die Rückkamera bzw. die Fotoauswahl.
2. Einen einzelnen Barcode nah und scharf aufnehmen. Die Karte liest ihn lokal auf dem iPhone aus. Alternativ die Ziffern manuell eingeben.
3. Kategorie prüfen und **Einbuchen** antippen. Bei einem neuen Barcode sucht der Pi anschließend im Hintergrund nach Produktdaten und Bild. Bis dahin erscheint der Barcode in der Liste.

EAN-8, EAN-13 und UPC-A werden unterstützt. Ein unterstützter GS1-Code kann zusätzlich ein MHD (AI 15) liefern. Der Pi prüft die GTIN und verwendet dieselbe Bestandslogik wie beim Scan am Touchdisplay.

Die Karte enthält den Barcode-Decoder [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) 3.1.8 mit ZXing-C++. Für den Scan sind weder ein CDN noch ein externer Foto-Upload nötig.
