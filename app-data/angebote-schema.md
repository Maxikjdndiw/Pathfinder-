# Pathfinder DE: Angebotsliste (angebote.json) und Filter

Zweck: Alle Empfehlungen kommen aus dieser festen Liste. Die KI erfindet keine Angebote. Sie wählt nur Felder und Stufe aus, das Frontend filtert und zeigt Karten. Das kostet keine API-Token und die Angaben sind geprüft.

## Felder pro Angebot

- `id`: eindeutiger Text, zum Beispiel `jugend-forscht-2027`
- `typ`: kurs, sommerkurs, praktikum, wettbewerb, hochschule, studiengang oder freiwilligendienst
- `name` und `anbieter`
- `felder`: Liste von Feld-Kennungen (siehe Wissensblock im Prompt, zum Beispiel `mode`, `ki`, `wirtschaft`)
- `stufen`: Liste aus `jung`, `mittel`, `abschluss`
- `land`: `DE` oder Ländercode (zum Beispiel `ES`, `IT`, `NL`, `GB`), dazu `ort` und `online` (true oder false)
- `kosten_pro_jahr_eur`: Zahl (0 bedeutet kostenlos oder nur Semesterbeitrag), `null` bedeutet unbekannt
- `kosten_label`: staatlich, kostenpflichtig, kostenintensiv oder sehr kostenintensiv
- `zeitraum` (Text) und `frist` (Datum oder `null`)
- `mindestalter` oder `klasse_min` (optional)
- `link`: offizielle Seite
- `zuletzt_geprueft`: Datum
- `kurzbeschreibung`: ein Satz auf Deutsch

## Filter im Frontend (ohne KI)

- **Land:** Alle, Deutschland, Ausland (optional mit Länderauswahl).
- **Kosten pro Jahr:** Schieberegler mit zwei Griffen für Minimum und Maximum. Stufen zum Beispiel 0, 1.000, 5.000, 10.000, 20.000, 30.000 und 50.000 oder mehr. Schnellwahl-Chips: "Kostenlos oder nur Semesterbeitrag", "bis 1.000 €", "über 30.000 €".
- **Typ:** Mehrfachauswahl (Kurs, Sommerkurs, Praktikum, Wettbewerb, Hochschule, Studiengang, Freiwilligendienst).
- **Stufe:** vorausgewählt aus dem Profil, änderbar.
- **Felder:** vorausgewählt aus dem, was der Schüler angetippt hat.
- **Sortierung:** nach Frist, Kosten oder Passung.
- Angebote ohne Kostenangabe bleiben sichtbar, mit dem Hinweis "Kosten unbekannt".
- Jede Karte zeigt "zuletzt geprüft am" und den Link zur offiziellen Seite.
- **Merken:** Ein Herz-Symbol speichert die Karte als ID im Profil des Schülers.

## Stufen (aus der Klasse im Profil abgeleitet)

- `jung` (bis Klasse 10): Kurse, Schnupperpraktika, Sommerkurse, Wettbewerbe, Ehrenamt.
- `mittel` (Oberstufe, nicht das letzte Jahr): Praktika, Kurse, Sommerkurse, erste Hochschulinfos.
- `abschluss` (letztes Schuljahr): zuerst Hochschulen und Studiengänge, dazu Kurzkurse, Praktika und Freiwilligendienste.

## Beispieleinträge (aus der Recherche, Stand November 2026)

```json
[
  {
    "id": "jugend-forscht-2027",
    "typ": "wettbewerb",
    "name": "Jugend forscht 2027",
    "anbieter": "Stiftung Jugend forscht e. V.",
    "felder": ["ki", "informatik", "ingenieur", "naturwiss"],
    "stufen": ["jung", "mittel", "abschluss"],
    "land": "DE",
    "ort": "bundesweit",
    "online": false,
    "kosten_pro_jahr_eur": 0,
    "kosten_label": "staatlich",
    "zeitraum": "Projektarbeit bis Januar 2027, Bundesfinale 27. bis 30. Mai 2027",
    "frist": "2026-11-30",
    "mindestalter": 15,
    "link": "https://www.jugend-forscht.de",
    "zuletzt_geprueft": "2026-11-19",
    "kurzbeschreibung": "Bundesweiter Nachwuchswettbewerb in MINT, Teilnahme allein oder im Team, Anmeldung online."
  },
  {
    "id": "amd-modedesign-ba",
    "typ": "studiengang",
    "name": "Mode Design (B.A.)",
    "anbieter": "AMD Akademie Mode & Design",
    "felder": ["mode", "design"],
    "stufen": ["abschluss"],
    "land": "DE",
    "ort": "Berlin, Düsseldorf, Hamburg, München, Wiesbaden",
    "online": false,
    "kosten_pro_jahr_eur": 9000,
    "kosten_label": "kostenpflichtig",
    "zeitraum": "Start im Wintersemester, 7 Semester",
    "frist": null,
    "link": "https://www.amd-akademie.de",
    "zuletzt_geprueft": "2026-11-19",
    "kurzbeschreibung": "Private Hochschule, laut Vergleichsportal ab etwa 750 € pro Monat, Gebühren bitte beim Anbieter bestätigen."
  }
]
```

Hinweis: Die Beispiel-Links sind Platzhalter und müssen vor dem Start durch die geprüften offiziellen Seiten ersetzt werden.

## Ergänzungen vom 21.11.2026

Neue Werte für `typ`:
- `simulation`: kostenlose Job-Simulation (Forage), online, englisch, selbstbestimmtes Tempo, Zertifikat. `land` ist INT, `online` ist true.
- `onlinekurs`: bezahlter oder teilweise kostenloser Kurs (Coursera). `kosten_pro_jahr_eur` ist null, stattdessen steht in `kosten_hinweis` der Preisrahmen. Coursera rechnet per Abo ab, den aktuellen Preis immer auf der Kursseite prüfen. Viele Kursinhalte lassen sich kostenlos ansehen.

Neue optionale Felder:
- `zielgruppe`: `schueler` (Standard, offen für Schüler) oder `alle` (Online-Angebote ohne Schülerbezug, offen für jeden).
- `sprache`: `de` (Standard) oder `en`. Die KI soll bei englischen Angeboten sagen, dass sie auf Englisch sind.
- `kosten_hinweis`: freier Text zu unklaren Preisen.

Hinweise zur Ehrlichkeit:
- Praktika mit Qualität C stammen aus Jobportalen, die KI soll dazu sagen: "Bitte auf der Karriereseite des Unternehmens prüfen".
- Termine aus 2026 sind Beispiele für den Rhythmus, nicht für 2027. Die KI nennt sie nicht als aktuelle Frist.
- Viele Beratungs- und Bankprogramme (McKinsey, Bain, BCG, Roland Berger, Oliver Wyman) sind nur für Studierende. Sie gehören nicht als Schülerpraktikum in die Liste.
