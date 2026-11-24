# Anleitung für Maxi: Coach, Zugangscodes und Mentorenbereich

## 1. Umgebungsvariablen bei Netlify

Eintragen unter https://app.netlify.com, Seite "pathfinderde", dann "Site configuration", "Environment variables", "Add a variable". Schlüssel und Passwörter trägst nur du dort ein, nie in eine Datei im Projekt.

| Variable | Pflicht | Wofür |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | ja | Der Schlüssel für die KI (console.anthropic.com, "API Keys"). |
| `PATHFINDER_ACCESS_CODES` | ja | Feste Codes, kommagetrennt, Form `ABCD-1234`. Bleiben immer gültig, auch neben den selbst angeforderten Codes. |
| `MENTOR_PASSWORT` | ja | Passwort für den Mentorenbereich. Lang und zufällig wählen. Ohne diese Variable bleibt der Mentorenbereich zu. Nach 10 falschen Versuchen in 15 Minuten ist die Anmeldung von dieser Adresse aus 15 Minuten gesperrt. |
| `MENTOR_PFAD` | ja | Geheime Adresse des Mentorenbereichs, mindestens 16 Zeichen aus Buchstaben, Zahlen und Bindestrichen, zum Beispiel aus einem Passwortgenerator. Die Seite gibt es dann nur unter `/m/` plus diesem Wert. `/mentor` existiert nicht. |
| `MAIL_API_KEY` | nein | Schlüssel von Resend (resend.com). Ohne ihn werden keine E-Mails verschickt, alles andere läuft weiter. |
| `MENTOR_MAIL_AN` | nein | Deine Adresse für neue Anfragen. |
| `MAIL_ABSENDER` | nein | Absender, zum Beispiel `Pathfinder DE <hello@mypathfinder.site>`. Die Domain muss in Resend bestätigt sein. Ohne eigene Domain schickt Resend nur an deine eigene Adresse. |
| `MAX_NEUE_CODES_PRO_TAG` | nein | Höchstzahl neuer Codes pro Tag, Standard 30. Danach kommen Leute auf die Warteliste. |
| `PATHFINDER_DAILY_LIMIT` | nein | Nachrichten pro Code und Tag, Standard 60. |

Nicht bei Netlify eintragen: `PATHFINDER_MOCK` (nur für lokale Tests ohne KI).

Nach dem Eintragen einmal neu bauen lassen: "Deploys", "Trigger deploy", "Deploy site".

## 2. So nutzt du den Mentorenbereich

1. Öffne `https://pathfinderde.netlify.app/m/DEIN-MENTOR-PFAD` (dein Wert aus `MENTOR_PFAD`) und gib dein Passwort ein. Speichere die Adresse als Lesezeichen und gib sie niemandem. Neue Anfragen per E-Mail enthalten den Link auch.
2. "Anfragen": Links stehen alle Anfragen, offene oben. Ein blauer Punkt heißt: neue Nachricht vom Schüler.
3. Anfrage antippen: Du siehst Zusammenfassung, Kurzprofil und den Verlauf. Unten schreibst du deine Antwort ("Antworten", oder Strg/Cmd und Enter).
4. Der Schüler sieht deine Antwort im Coach unter "Mentor", spätestens nach etwa 6 Sekunden. Hat er eine E-Mail-Benachrichtigung gewählt, bekommt er zusätzlich eine kurze E-Mail (ohne den Inhalt deiner Nachricht).
5. "Als erledigt markieren" sortiert die Anfrage nach unten. Schreibt der Schüler wieder, ist sie automatisch wieder offen.
6. "Zugänge": alle selbst angeforderten Codes mit Vorname, Datum und letzter Anmeldung. "Sperren" macht einen Code sofort ungültig, "Entsperren" hebt das wieder auf. Codes aus `PATHFINDER_ACCESS_CODES` stehen nicht in der Liste; die änderst du in der Variable.

Wenn eine Anfrage nicht im Mentorenbereich auftaucht: Unter "Forms" bei Netlify nachsehen. Fällt die Funktion aus, geht die Anfrage still über das Formular `mentor-anfrage` dorthin.

## 3. Lokal testen (kostenlos, ohne KI)

In die `.env` im Projektordner zusätzlich `PATHFINDER_MOCK=1`, ein Test-Passwort `MENTOR_PASSWORT=...` und einen Test-Pfad `MENTOR_PFAD=...` schreiben, dann:

```
netlify dev
```

Im Browser http://localhost:8888 öffnen und prüfen:

1. Oben "Zugang erhalten": Vorname und E-Mail eingeben. Ein Code erscheint, "Weiter zur Anmeldung" füllt ihn ein.
2. Anmelden, Startkarte "Lebenslauf verbessern". Unten erscheint "Mit einem Menschen sprechen". Regler ziehen, "Anfragen".
3. In einem zweiten Tab `/m/` plus deinen `MENTOR_PFAD` öffnen, anmelden, Anfrage antippen, antworten.
4. Zurück im ersten Tab: Unter "Mentor" erscheint die Antwort.
5. Abmelden und mit einem Code aus `PATHFINDER_ACCESS_CODES` anmelden: geht ebenfalls.

Vor dem echten Test die Zeile `PATHFINDER_MOCK=1` wieder löschen und `netlify dev` neu starten.

Falls `netlify dev` jede Anfrage mit Fehler 500 beantwortet und im Terminal "NODE_OPTIONS" steht: `env -u NODE_OPTIONS netlify dev` starten.

## 4. Was du NICHT tun sollst

- Schlüssel und Passwörter nie in Dateien, Chats oder Screenshots schreiben.
- Die `.env` nie hochladen. Vor jedem Commit mit `git status` prüfen, dass sie nicht in der Liste steht.
- Nicht pushen, bevor die Testschritte oben funktionieren.
- Die Datenschutztexte (Coach und Datenschutzseite, Abschnitt 6) vor dem Start von einer Anwältin oder einem Anwalt prüfen lassen.

## 5. Zurückrollen, wenn etwas schiefgeht

Schnell, ohne Code: Bei Netlify unter "Deploys" den letzten funktionierenden Deploy anklicken und "Publish deploy" wählen. Die Seite ist sofort wieder auf diesem Stand.

Dauerhaft im Code (im Projektordner, nacheinander):

```
git log --oneline -5
```

Den Hash des fehlerhaften Commits notieren, dann:

```
git revert <hash>
```

```
git push
```

Die gespeicherten Daten (Codes, Anfragen) liegen in Netlify Blobs und bleiben beim Zurückrollen erhalten.
