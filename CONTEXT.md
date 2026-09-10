# Opstelling Coach — Context

Domeinwoordenlijst voor de opstellingen-app. Puur begrippen, geen implementatiedetails.

## Glossary

- **Team**: de vaste groep kinderen die de coach dit (en toekomstige) seizoen(en) coacht. Nu: één team, single-user (alleen de coach heeft toegang). Datamodel houdt er rekening mee dat een tweede coach/team er later bij kan, ook al wordt dat nu niet gebouwd.
- **Seizoen**: een tijdvak (bv. 2025-2026) waarbinnen wedstrijden en statistieken worden bijgehouden; geschiedenis van eerdere seizoenen blijft zichtbaar naast elkaar.
- **Speler**: lid van het team met naam, rugnummer, en een los opmerkingenveld dat niet aan een positie of wedstrijd gebonden is.
- **Wedstrijd**: één voetbalwedstrijd, gespeeld in het formaat 8-tegen-8 of 11-tegen-11, opgedeeld in kwarten.
- **Kwart**: één van de vier tijdsvakken waarin een wedstrijd is opgedeeld. Wisselen van opstelling gebeurt op kwart-grenzen, niet tussentijds.
- **Formatie**: de vaste indeling van veldposities voor een wedstrijdformaat (bv. 1-3-3-1 voor 8-tegen-8), gebaseerd op standaard KNVB-spelvormen als uitgangspunt, later door de coach aanpasbaar.
- **Positie**: een vak binnen een formatie (bv. keeper, linksback, spits) waar per kwart een speler wordt ingezet.
- **Opstelling**: de toewijzing van spelers aan posities voor één kwart van een wedstrijd.
- **Wissel / Wisselbank**: een speler die in een gegeven kwart niet op het veld staat. De selectie is doorgaans iets groter dan het aantal veldposities, dus er staan elk kwart 1-3 spelers op de bank. Bijgehouden per kwart om te zien hoe vaak iemand als wissel heeft gestaan.
- **Beoordeling**: een score plus vrije tekst die de coach per speler, per kwart, per positie invult over hoe het ging op die positie. Schaal van de score is nog te bepalen.
- **Favoriete positie (meest gespeeld)**: de positie waarop een speler over de tijd de meeste kwarten heeft gestaan.
- **Favoriete positie (best beoordeeld)**: de positie waarop een speler over de tijd gemiddeld de hoogste beoordeling heeft. Wordt apart getoond naast "meest gespeeld", niet gecombineerd tot één cijfer.
- **Aanwezigheid / Afmelding**: registratie per wedstrijd van welke spelers beschikbaar zijn. Bepaalt wie er die wedstrijd in de opstelling of op de wisselbank kan komen.
- **Fitheid-status**: aanduiding dat een speler bv. herstellende is van een blessure, ter info bij het maken van de opstelling.
