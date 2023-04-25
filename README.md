# homebridge-CommandePorteDeGarage-MQTT

<img src="https://github.com/CapitaineKirk/homebridge-CommandePorteDeGarage-MQTT/blob/main/photos/HW-584.jpg" width=150 align="right" />  

## But

Envoyer des commandes au module HW-584 dans le cadre d'une integration dans homebridge d'un dispositif permettant de contrôler une porte du garage.
Ce module est équipé d'une connexion ethernet et de seize entrées/sorties configurables.  

## Remerciements
Merci à l'équipe homebrdige (https://homebridge.io) pour la qualité de son travail.  
Merci à Michael Nielson (https://github.com/nielsonm236) pour son firmware alternatif pour le HW-584 (travail de pro, respect).

## Installation

1. Installez [homebridge](https://github.com/nfarina/homebridge#installation-details)  
2. Installez ce plugin: `npm install -g homebridge-CommandePorteDeGarage-MQTT`  
3. Mettez à jour le fichier `config.json`  
4. Configurez le module HW-584 (voir la doc sur le site de Michael)

## Configuration

```json
"accessories": [
     {
       "accessory": "CommandePorteDeGarage-MQTT",
       "name": "Porte de garage",
       "module": "PorteDeGarage",
       "actionneurPorte": 1,
       "capteurOuvert": 4,
       "capteurFerme": 3,
       "delaiDeReaction" : 2,
       "delaiDeMouvement" : 20,
       "delaiInterCommandes" : 2,
       "intervalLecture": 1,
       "debug": 0
      }
]
```

| Key | Description | Default |
| --- | --- | --- |
| `accessory` | Doit être `CommandePorteDeGarage-MQTT` | N/A |
| `name` | Nom qui apparaîtra dans l'application Home | N/A |
| `module` | Nom déclaré dans la configuration du HW-584 | N/A |
| `actionneurPorte` | Numéro de la sortie connectée à la commande d'ouverture/fermeture de la porte | N/A |
| `capteurOuvert` | Numéro de l'entrée connectée au capteur détectant l'état ouvert | N/A |
| `capteurFerme` | Numéro de l'entrée connectée au capteur détectant l'état fermé | N/A |
| `delaiDeReaction` | Délai maximum attendu en seconde entre une commande de mouvement et le début du mouvement de la porte (permet de gérer les obstructions) | 2 |
| `delaiDeMouvement` | Délai maximum attendu en seconde entre une commande de mouvement et la fin du mouvement de la porte (permet de gérer les obstructions) | 20 |
| `intervalLecture` | Interval de lecture de l'état du module en seconde| 1 |
| `debug` | Active le mode verbeux | 0 |


## Installation
Le but est de mettre en place des capteurs sur le mécanisme d'ouverture/fermeture de la porte de garage de manière non intrusive.  
  
Pour cela, il faut installer des capteurs de feuillures sur le rail du moteur et placer un aimant sur le moteur.  
<img src="https://github.com/CapitaineKirk/homebridge-CommandePorteDeGarage-MQTT/blob/main/photos/CapteurFerme.jpg" width=150 align="right" />
<img src="https://github.com/CapitaineKirk/homebridge-CommandePorteDeGarage-MQTT/blob/main/photos/CapteurOuvert.jpg" width=150 align="right" />

La sortie du module, choisie pour commander la porte, est connectée en parallèle du bouton poussoir permettant l'ouverture ou la fermeture de celle-ci.  
