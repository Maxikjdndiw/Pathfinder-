# Anleitung für Maxi: Coach starten und testen

Der Coach unter `/app` ist fertig gebaut. Damit er mit der echten KI antwortet, fehlen nur drei Dinge, die nur du machen kannst: ein API-Schlüssel, Zugangscodes und die Einträge bei Netlify.

## 1. Was du tun musst

**Schritt 1: API-Schlüssel holen**
1. Öffne https://console.anthropic.com und melde dich an.
2. Klicke auf "Settings", dann "API Keys", dann "Create Key". Name zum Beispiel `pathfinder`.
3. Kopiere den Schlüssel (er beginnt mit `sk-ant-`). Er wird nur einmal angezeigt.
4. Unter "Settings", "Billing" prüfen, ob Guthaben da ist. Ohne Guthaben antwortet die KI nicht. Tipp: ein kleines Limit setzen.

**Schritt 2: Zugangscodes festlegen**
- Jeder Code hat 8 Zeichen in der Form `ABCD-1234` (4 Zeichen, Bindestrich, 4 Zeichen, Buchstaben und Zahlen). So sind die Eingabefelder auf der Login-Seite gebaut.
- Beispiel: `LENA-4821,PILOT-0193` passt nicht, weil `PILOT` 5 Zeichen hat. Richtig wäre `PILO-0193`.
- Schreib dir die Codes auf. Jede Schülerin und jeder Schüler bekommt einen eigenen Code.
- Andere Länge gewünscht? In `src/app/code-slots.ts` oben `CODE_SLOTS` und `CODE_SPLIT` ändern.

**Schritt 3: Lokale Datei `.env` anlegen** (im Projektordner, gleiche Ebene wie `package.json`)

```
ANTHROPIC_API_KEY=sk-ant-dein-schlüssel
PATHFINDER_ACCESS_CODES=LENA-4821,TEST-1234
PATHFINDER_DAILY_LIMIT=60
```

Die Datei steht in `.gitignore` und wird nicht hochgeladen.

**Schritt 4: Lokal starten**
- Einmal installieren: `npm install -g netlify-cli`, danach `netlify login` und `netlify link` (die Seite "pathfinderde" auswählen).
- Starten: `netlify dev`. Dann im Browser http://localhost:8888/app öffnen.
- Ohne Netlify CLI geht auch `npm run dev` (dann http://localhost:5173/app). Beide lesen die `.env`.
- Kostenlos testen ohne KI: in die `.env` zusätzlich `PATHFINDER_MOCK=1` schreiben. Dann kommen feste Testantworten. Vor dem echten Test die Zeile wieder löschen.

**Schritt 5: Einträge bei Netlify** (erst, wenn lokal alles geht)
1. https://app.netlify.com öffnen, Seite "pathfinderde" anklicken.
2. "Site configuration", dann "Environment variables", dann "Add a variable".
3. Die drei Werte aus der `.env` einzeln eintragen: `ANTHROPIC_API_KEY`, `PATHFINDER_ACCESS_CODES`, `PATHFINDER_DAILY_LIMIT`. `PATHFINDER_MOCK` NICHT eintragen.

## 2. So prüfst du, ob alles geht

1. `/app` öffnen, einen falschen Code eingeben: Die Felder wackeln, werden rot, Text "Dieser Code passt nicht. Bitte prüfe ihn noch einmal."
2. Richtigen Code eingeben (oder einfügen), Alter wählen, Datenschutz ankreuzen: Die Felder werden grün, der Chat öffnet sich.
3. Eine Startkarte antippen: Die Denk-Anzeige erscheint, dann kommt eine Antwort, darüber kurz "Fertig in ...".
4. Bis zu "CV und LinkedIn" weitermachen: Unten erscheint "Mit einer echten Person sprechen". Den Regler nach rechts ziehen, Formular ausfüllen: Der Regler wird grün, "Angefragt".
5. Startseite öffnen: "Kostenlos mitmachen" steht oben im Header (weiß) und im Hero (blau). "Test starten" im Bereich "Pathfinder Run" ist metallisch, ebenso der Regler für die Mentor-Anfrage im Coach.

Die Mentor-Anfrage kommt erst auf der echten Seite an (Netlify Forms). Lokal wird sie nur simuliert. Nach dem Push in Netlify unter "Forms" nachsehen.

## 3. Was du NICHT tun sollst

- Den API-Schlüssel nie in den Code, in Chats oder Screenshots schreiben.
- Die `.env` nie hochladen. Vor jedem Commit mit `git status` prüfen, dass `.env` NICHT in der Liste steht.
- Nicht pushen, bevor die Testschritte oben funktionieren. Jeder Push kostet Netlify-Build-Minuten.
- Die Rechtstexte (Datenschutzhinweis im Coach) vor dem Start von einer Anwältin oder einem Anwalt prüfen lassen.

## 4. Am Ende sicher pushen (nur wenn du willst, einmal)

Im Projektordner nacheinander:

```
git status
```

Prüfen: keine `.env` in der Liste.

```
npm test
```

```
npm run build
```

Beide müssen ohne Fehler durchlaufen.

```
git add -A
```

```
git commit -m "Rework Teil 1 bis 3: Buttons, Hintergründe, Chat, Code-Login"
```

```
git push
```

Hinweis: Es liegt schon ein früherer, noch nicht gepushter Commit für den Coach bereit. Der geht mit diesem Push zusammen hoch. Danach baut Netlify die Seite einmal neu.
