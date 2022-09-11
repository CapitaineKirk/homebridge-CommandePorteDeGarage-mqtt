var Service;
var Characteristic;

var mqtt = require("mqtt");

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-CommandePorteDeGarage-MQTT', 'CommandePorteDeGarage-MQTT', PorteDeGarageAccessoryMqtt);
};

function PorteDeGarageAccessoryMqtt(log, config) {
  this.log = log;
  this.name = config.name;
  this.client_Id = 'mqttCommande' + config.module;
  this.options = {
    keepalive: 10,
    clientId: this.client_Id,
    protocolId: 'MQTT',
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    will: {
      topic: 'WillMsg',
      payload: 'Connection Closed abnormally..!',
      qos: 0,
      retain: false
    },
    rejectUnauthorized: false
  };

  this.client = mqtt.connect("mqtt://localhost", this.options);

  this.client.on('error', this.mqttGererErreur.bind(this));
  this.client.on('connect', this.mqttGererConnexion.bind(this));
  this.client.on('message', this.mqttGererMessage.bind(this));

  this.MqttTopicCapteurPorteOuverte = "NetworkModule/" + config.module + "/input/0" + config.capteurPorteOuverte;
  this.MqttTopicCapteurPorteFermee  = "NetworkModule/" + config.module + "/input/0" + config.capteurPorteFermee;
  this.MqttTopicCommandeActionneur  = "NetworkModule/" + config.module + "/output/0" + config.actionneurPorte + "/set";

  this.client.subscribe(this.MqttTopicCapteurPorteOuverte);
  this.client.subscribe(this.MqttTopicCapteurPorteFermee);

  this.delaiDeReaction = 1000 * (config.delaiDeReaction || 2);
  this.delaiDeMouvement = 1000 * (config.delaiDeMouvement || 20);
  this.delaiInterCommandes = 1000 * (config.delaiInterCommandes || 2);
  this.intervalLecture = config.intervalLecture || 1;
  this.debug = config.debug || 0;
  this.etatPorteActuel = Characteristic.CurrentDoorState.CLOSED; //Etat initial
  this.etatPorteDemande = Characteristic.TargetDoorState.CLOSED; //Etat initial
  this.etatPorteObstruction = false; //Etat initial
  this.etatCapteurFerme = false;
  this.etatCapteurOuvert = false;
  this.horodatageMouvement = 0;
  this.horodatageCommande = 0;
  this.commandeEnAttente = 0;
  
  if(this.debug) {
     this.log("MqttTopicCapteurPorteOuverte = " + this.MqttTopicCapteurPorteOuverte);
     this.log("MqttTopicCapteurPorteFermee = " + this.MqttTopicCapteurPorteFermee);
     this.log("MqttTopicCommandeActionneur = " + this.MqttTopicCommandeActionneur);
  }

  this.log('Fin PorteDeGarageAccessoryMqtt');
}

PorteDeGarageAccessoryMqtt.prototype.setStateDemande = function(estFerme, callback, context) {
  if (context === 'pollState') {
    // The state has been updated by the pollState command - don't run the open/close command
    callback(null);
    return;
  }

  var accessory = this;
  var etatDemande = estFerme ? 'close' : 'open';

  accessory.log('Appel de setStateDemande : etat = ' + etatDemande + ', context = ' + context);

  if(etatDemande == 'open') {
    accessory.etatPorteDemande = Characteristic.TargetDoorState.OPEN;
  }
  if(etatDemande == 'close') {
    accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
  }

  callback();

  if (accessory.stateTimer) {
     clearTimeout(this.stateTimer);
     accessory.stateTimer = null;
  }
  accessory.stateTimer = setImmediate(accessory.gererEtat.bind(accessory));

  return true;
};

PorteDeGarageAccessoryMqtt.prototype.getStateActuel = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateActuel : etat = ' + accessory.etatPorteActuel);

  callback(null, accessory.etatPorteActuel);
}

PorteDeGarageAccessoryMqtt.prototype.getStateDemande = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateDemande : etat = ' + accessory.etatPorteDemande);

  callback(null, accessory.etatPorteDemande);
}

PorteDeGarageAccessoryMqtt.prototype.getStateObstruction = function(callback) {
  var accessory = this;

  accessory.log('Appel de getStateObstruction : etat = ' + accessory.etatPorteObstruction);

  callback(null, accessory.etatPorteObstruction);
}

PorteDeGarageAccessoryMqtt.prototype.mqttGererErreur = function() {
  var accessory = this;

  accessory.log("Erreur Mqtt");
}

PorteDeGarageAccessoryMqtt.prototype.mqttGererConnexion = function(topic, message) {
  var accessory = this;

  accessory.log("Confirmation de la connexion au broker MQTT");
}

PorteDeGarageAccessoryMqtt.prototype.mqttGererMessage = function(topic, message) {
  var accessory = this;
  var status;

  if(accessory.debug) {
    accessory.log("Message brut = " + message.toString());
  }

  // Capteur      ON   OFF
  // PorteOuverte Faux Vrai
  // PorteFermee  Faux Vrai

  status = message.toString();
  accessory.log("Message reçu de " + accessory.name + " : " + topic + " = " + status);

  messageRecu = false;

  switch(topic) {
    case accessory.MqttTopicCapteurPorteOuverte :
      switch(status) {
        case 'ON' :
          accessory.etatCapteurOuvert = false;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurOuvert de ' + accessory.name + ' est : faux');
          }
          messageRecu = true;
          break;
        case 'OFF' :
          accessory.etatCapteurOuvert = true;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurOuvert de ' + accessory.name + ' est : vrai');
          }
          messageRecu = true;
        break;
      }
    break;
    case accessory.MqttTopicCapteurPorteFermee :
      switch(status) {
        case 'ON' :
          accessory.etatCapteurFerme = false;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurFerme de ' + accessory.name + ' est : faux');
          }
          messageRecu = true;
        break;
        case 'OFF' :
          accessory.etatCapteurFerme = true;
          if(accessory.debug) {
            accessory.log('Réception Mqtt, état du capteurFerme de ' + accessory.name + ' est : vrai');
          }
          messageRecu = true;
        break;
      }
    break;
  }
  if(messageRecu) {
    if (accessory.stateTimer) {
       clearTimeout(this.stateTimer);
       accessory.stateTimer = null;
    }
    accessory.stateTimer = setImmediate(accessory.gererEtat.bind(accessory));
  }
}

PorteDeGarageAccessoryMqtt.prototype.gererEtat = function() {
  var accessory = this;
  var horodatageGestionEtat = Date.now();
  var changeEtatActuel = false;
  var changeEtatDemande = false;
  var changeEtatObstruction = false;
  var RelanceGererEtat = false;

  if(accessory.debug) {
    accessory.log('Etat demande      : ' + accessory.etatPorteDemande);
    accessory.log('Etat actuel       : ' + accessory.etatPorteActuel);
    accessory.log('Etat obstruction  : ' + accessory.etatPorteObstruction);
  }

  if(accessory.debug) {
    accessory.log('Etat du capteurOuvert de ' + accessory.name + ' est : ' + '(' + accessory.etatCapteurOuvert + ')');
    accessory.log('Etat du capteurFerme de ' + accessory.name + ' est : ' + '(' + accessory.etatCapteurFerme + ')');
  }

  // en fonction des etats des capteurs et de l'etat actuel, detection d'un mouvement de la porte
  if(!accessory.etatCapteurOuvert && !accessory.etatCapteurFerme) {
    if(accessory.etatPorteActuel == Characteristic.CurrentDoorState.OPEN) {
      // si les capteurs ouvert et ferme ne sont pas a vrai (donc la porte est entre les deux)
      // et que l'etat actuel de la porte est ouvert alors :
      // - l'etat actuel de la porte devient en fermeture
      // - l'etat demande de la porte est ferme
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.CLOSING;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Fermeture');
      accessory.horodatageMouvement = Date.now();
      // Il faute relancer la tache GererEtat
      RelanceGererEtat = true;

      if(accessory.etatPorteDemande != Characteristic.TargetDoorState.CLOSED) {
        accessory.log('Demande de fermeture de ' + accessory.name + ' par l\'interrupteur ou une télécommande');
        accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
        changeEtatDemande = true;
      }
      if(accessory.horodatageCommande == 0) {
        // si il n'y a pas d'horodatage de la commande (donc action par telecommande  ou l'interrupteur) 
        accessory.horodatageCommande = accessory.horodatageMouvement;
      } else {
        // sinon la commande a ete activee par home => affichage du delai de reaction entre l'impulsion et 
        // le changement d'etat des capteurs
        accessory.log('Temps de réaction = ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000 + ' s');
      }
      if(accessory.etatPorteObstruction) {
        // le capteur ouvert vient de passer a OFF alors que la porte etait precedement en position ouvert
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
    if(accessory.etatPorteActuel == Characteristic.CurrentDoorState.CLOSED) {
      // si les capteurs ouvert et ferme ne sont pas a vrai (donc la porte est entre les deux)
      // et que l'etat actuel de la porte est ferme alors :
      // - l'etat actuel de la porte devient en ouverture
      // - l'etat demande de la porte est ouvert
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPENING;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Ouverture');
      accessory.horodatageMouvement = Date.now();
      // Il faute relancer la tache GererEtat
      RelanceGererEtat = true;
      
      if(accessory.etatPorteDemande != Characteristic.TargetDoorState.OPEN) {
        accessory.log('Demande d\'ouverture  de ' + accessory.name + ' par l\'interrupteur ou une télécommande');
        accessory.etatPorteDemande = Characteristic.TargetDoorState.OPEN;
        changeEtatDemande = true;
      }
      if(accessory.horodatageCommande == 0) {
        // si il n'y a pas d'horodatage de la commande (donc action par telecommande  ou l'interrupteur) 
        accessory.horodatageCommande = accessory.horodatageMouvement;
      } else {
        // sinon la commande a ete activee par home => affichage du delai de reaction entre l'impulsion et 
        // le changement d'etat des capteurs
        accessory.log('Temps de réaction = ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000 + ' s');
      }
      if(accessory.etatPorteObstruction) {
        // le capteur ferme vient de passer a OFF alors que la porte etait precedement en position ferme
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  if(accessory.etatCapteurFerme) {
    if(accessory.etatPorteActuel != Characteristic.CurrentDoorState.CLOSED) {
      // si le capteur ferme est a vrai (donc la porte est fermee)
      // et que l'etat actuel de la porte n'est pas ferme alors :
      // - l'etat actuel de la porte devient fermee
      // - l'etat demande de la porte est ferme
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.CLOSED;
      accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
      changeEtatDemande = true;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : Ferme');
      accessory.log('Temps de fermeture = ' + (horodatageGestionEtat - accessory.horodatageMouvement)/1000 + ' s');
      accessory.horodatageMouvement = 0;
      accessory.horodatageCommande = 0;
      
      if(accessory.etatPorteObstruction) {
        // le capteur ferme vient de passer a ON alors que la porte n'etait pas precedement en position ferme
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  if(accessory.etatCapteurOuvert) {
    if(accessory.etatPorteActuel != Characteristic.CurrentDoorState.OPEN) {
      // si le capteur ouvert est a vrai (donc la porte est ouverte)
      // et que l'etat actuel de la porte n'est pas ouvert alors :
      // - l'etat actuel de la porte devient ouvert
      // - l'etat demande de la porte est ouvert
      accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPEN;
      accessory.etatPorteDemande = Characteristic.CurrentDoorState.OPEN;
      changeEtatDemande = true;
      changeEtatActuel = true;
      accessory.log('Etat de ' + accessory.name + ' est : ouvert');
      accessory.log('Temps d\'ouverture = ' + (horodatageGestionEtat - accessory.horodatageMouvement)/1000 + ' s');
      accessory.horodatageMouvement = 0;
      accessory.horodatageCommande = 0;
      
      if(accessory.etatPorteObstruction) {
        // le capteur ouvert vient de passer a ON alors que la porte n'etait pas precedement en position ouverte 
        // donc la porte n'est plus dans l'etat d'obstruction
        accessory.log('Fin de l\'état d\'obstruction pour ' + accessory.name);
        accessory.etatPorteObstruction = false;
        changeEtatObstruction = true;
      }
    }
  }

  // Pour la porte la commande est rudimentaire : une impulsion =>
  // Cas 1 : si la porte est fermee => la porte s'ouvre
  // Cas 2 : si la porte est ouverte => la porte se ferme
  // Cas 3 : si la porte est en train de se fermer => la porte s'arrete
  // Cas 4 : si la porte est en train de s'ouvrir => la porte s'arrete
  // Cas 5 : si la porte est arretee => elle s'ouvre si elle avait ete arretee en train de se fermer,
  //         ou se ferme si elle avait ete arretee en train de s'ouvrir

  // en fonction de l'etat demande on detecte une demande d'ouverture/fermeture provenant de home
  switch(accessory.etatPorteDemande) {
    case Characteristic.TargetDoorState.OPEN :
      switch(accessory.etatPorteActuel) {
        case Characteristic.CurrentDoorState.CLOSED :
          // si l'etat demande est ouvert et que la porte est fermee
          // Il est inutile de changer l'etat actuel.
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
          
          if(accessory.horodatageCommande == 0) {
            // Si pas aucune commande n'a ete envoyee => Cas 1 : on active la commande
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé) => une implusion');
            accessory.commandeEnAttente++;
          } else if ((horodatageGestionEtat - accessory.horodatageCommande) < accessory.delaiDeReaction) {
            // Si une commande a deja ete envoyee depuis moins de <delaiDeReaction> secondes, on attend
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé), en attente de mouvement');
          } else {
            // Si une commande a deja ete envoyee depuis plus de <delaiDeReaction> secondes, et que rien ne bouge, il y a un pb
            //   => on change l'etat demande a CLOSED (on annule la demande) et on passe en etat d'obstruction
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvert, fermé), pas de mouvement, on annule la demande');
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (fermé, ferméé) => obstruction');
            accessory.etatPorteDemande = Characteristic.TargetDoorState.CLOSED;
            changeEtatDemande = true;
            accessory.etatPorteObstruction = true;
            changeEtatObstruction = true;
            accessory.horodatageCommande = 0;
          }
        break;
        case Characteristic.CurrentDoorState.CLOSING : 
          // si l'etat demande est ouvert et que la porte est en train de se fermer
          // => Cas 3 : on active la commande
          // Il faut changer l'etat actuel de la porte de fermeture a stoppe
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en fermeture) => une impulsion');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvrir, stoppé');
          accessory.etatPorteActuel = Characteristic.CurrentDoorState.STOPPED;
          changeEtatActuel = true;
          accessory.commandeEnAttente++;
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
        case Characteristic.CurrentDoorState.OPENING :
          // si la demande est ouvert et que la porte est en train de s'ouvrir
          // on ne fait rien sauf si le delai est trop important
          if ((horodatageGestionEtat - accessory.horodatageMouvement) < accessory.delaiDeMouvement) {
            if(accessory.debug) {
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en ouverture) => rien');
            }
          } else {
            if(!accessory.etatPorteObstruction) {
              // la porte passe dans l'etat d'obstruction si elle ne l'est pas deja
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, en ouverture) et delai depasse => obstruction');
              accessory.etatPorteObstruction = true;
              changeEtatObstruction = true;
              accessory.horodatageCommande = 0;
            }
          }
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
        case Characteristic.CurrentDoorState.OPEN :
          // si l'etat demande est ouvert et que la porte est ouverte
          // on ne fait rien
          if(accessory.debug) {
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, ouvert) => rien');
          }
        break;
        case Characteristic.CurrentDoorState.STOPPED :
          // si l'etat demande est ouvert et que la porte est stoppee
          // => Cas 5 : on active la commande
          // Il faut changer l'etat actuel de la porte de stoppe a ouverture
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (ouvrir, stoppé) => une impulsion');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvrir, en ouverture)');
          accessory.etatPorteActuel = Characteristic.CurrentDoorState.OPENING;;
          changeEtatActuel = true;
          accessory.commandeEnAttente++;
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
      }
    break;
    case Characteristic.TargetDoorState.CLOSED : 
      switch(accessory.etatPorteActuel) {
        case Characteristic.CurrentDoorState.OPEN : 
          // si la demande est ferme et que la porte est ouverte
          // Il est inutile de changer l'etat actuel.
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
         
          if(accessory.horodatageCommande == 0) {
            // Si pas aucune commande n'a ete envoyee => Cas 1 : on active la commande
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, ouvert) => une implusion');
            accessory.commandeEnAttente++;
          } else if ((horodatageGestionEtat - accessory.horodatageCommande) < accessory.delaiDeReaction) {
            // Si une commande a deja ete envoyee depuis moins de <delaiDeReaction> secondes, on attend
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, ouvert), en attente de mouvement');
          } else {
            // Si une commande a deja ete envoyee depuis plus de <delaiDeReaction> secondes, et que rien ne bouge, il y a un pb
            //   => on change l'etat demande a OPEN (on annule la demande) et on passe en etat d'obstruction
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, ouvert), pas de mouvement, on annule la demande');
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (ouvert, ouvert) => obstruction');
            accessory.etatPorteDemande = Characteristic.TargetDoorState.OPEN;
            changeEtatDemande = true;
            accessory.etatPorteObstruction = true;
            changeEtatObstruction = true;
            accessory.horodatageCommande = 0;
          }
        break;
        case Characteristic.CurrentDoorState.OPENING : 
          // si la demande est ferme et que la porte est en train de s'ouvrir
          // => Cas 4 : on active la commande
          // Il faut changer l'etat actuel de la porte de ouverture a stoppe
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, en ouverture) => une impulsion');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennent : (fermé, stoppé)');
          accessory.etatPorteActuel = Characteristic.CurrentDoorState.STOPPED;
          changeEtatActuel = true;
          accessory.commandeEnAttente++;
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
        case Characteristic.CurrentDoorState.CLOSING : 
          // si la demande est ferme et que la porte est en train de se fermer
          // on ne fait rien sauf si le delai est trop important
          if ((horodatageGestionEtat - accessory.horodatageMouvement) < accessory.delaiDeMouvement) {
            if(accessory.debug) {
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, en fermeture) => rien');
            }
          } else {
            if(!accessory.etatPorteObstruction) {
              // la porte passe dans l'etat d'obstruction si elle ne l'est pas deja
              accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, en fermeture) et délai depassé => obstruction');
              accessory.etatPorteObstruction = true;
              changeEtatObstruction = true;
              accessory.horodatageCommande = 0;
            }
          }
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
        case Characteristic.CurrentDoorState.CLOSED : 
          // si la demande est ferme et que la porte est fermee
          // on ne fait rien
          if(accessory.debug) {
            accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, fermé) => rien');
          }
        break;
        case Characteristic.CurrentDoorState.STOPPED : 
          // si la demande est ferme et que la porte est stoppee
          // => Cas 5 : on active la commande
          // Il faut changer l'etat actuel de la porte de stoppe a fermeture
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' sont : (fermé, stoppé) => une impulsion');
          accessory.log('Etat demandé et actuel de ' + accessory.name + ' deviennentt : (fermé, en fermeture) => une impulsion');
          accessory.etatPorteActuel = Characteristic.CurrentDoorState.CLOSING;;
          accessory.commandeEnAttente++;
          // Il faute relancer la tache GererEtat
          RelanceGererEtat = true;
        break;
      }
    break;
  }

  // mise a jour des etats dans home en fonction de ce qui vient d'etre calcule
  if(changeEtatDemande) {
    accessory.garageDoorService.getCharacteristic(Characteristic.TargetDoorState).updateValue(accessory.etatPorteDemande);
  }
  if(changeEtatActuel) {
    accessory.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState).updateValue(accessory.etatPorteActuel);
  }
  if(changeEtatObstruction) {
    accessory.garageDoorService.getCharacteristic(Characteristic.ObstructionDetected).updateValue(accessory.etatPorteObstruction);
  }

  // Chaque nouvelle demande de commande incremente le compteur commandeEnAttente afin de gérer les demandes de commande quasi simulatanées 
  // le delai de <delaiInterCommandes> secondes est vérifie avant chaque nouvel envoi de commande.
  if(accessory.commandeEnAttente != 0) {
    if((accessory.horodatageCommande == 0) || ((horodatageGestionEtat - accessory.horodatageCommande) > accessory.delaiInterCommandes) ) {
      accessory.commandeEnAttente--;
      accessory.log("Commande mqtt envoyée ");
      accessory.horodatageCommande = Date.now();
      accessory.client.publish(accessory.MqttTopicCommandeActionneur, "ON", { qos: 0 });
      setTimeout(function() {
        accessory.client.publish(accessory.MqttTopicCommandeActionneur, "OFF", { qos: 0 });
      }, 500);
    } else {
      accessory.log('La précédente commande a été envoyée il y a ' + (horodatageGestionEtat - accessory.horodatageCommande)/1000  + ' s, pas de commande réenvoyée immédiatement');
    }
    accessory.log('Il reste ' + accessory.commandeEnAttente + ' commande(s) en attente');
  }

  // Clear any existing timer
  if (accessory.stateTimer) {
    clearTimeout(accessory.stateTimer)
    accessory.stateTimer = null;
  }

  if(RelanceGererEtat) {
    accessory.log('Relance de gererEtat dans ' + accessory.intervalLecture + 's');
    accessory.stateTimer = setTimeout(this.gererEtat.bind(this), accessory.intervalLecture * 1000);
  } else {
    accessory.log('Hibernation de gererEtat');
  }

};

PorteDeGarageAccessoryMqtt.prototype.getServices = function() {
  this.log('Debut Getservices');
  this.informationService = new Service.AccessoryInformation();
  this.garageDoorService = new Service.GarageDoorOpener(this.name);

  this.informationService
  .setCharacteristic(Characteristic.Manufacturer, 'Fabrique du Capitaine Kirk')
  .setCharacteristic(Characteristic.Model, 'Porte de garage Mqtt')
  .setCharacteristic(Characteristic.SerialNumber, '1.0.0');

  this.garageDoorService.getCharacteristic(Characteristic.TargetDoorState)
  .on('set', this.setStateDemande.bind(this))
  .on('get', this.getStateDemande.bind(this))
  .updateValue(this.etatPorteDemande);

  this.garageDoorService.getCharacteristic(Characteristic.CurrentDoorState)
  .on('get', this.getStateActuel.bind(this))
  .updateValue(this.etatPorteActuel);

  this.garageDoorService.getCharacteristic(Characteristic.ObstructionDetected)
  .on('get', this.getStateObstruction.bind(this))
  .updateValue(this.etatPorteObstruction);

  this.stateTimer = setTimeout(this.gererEtat.bind(this), this.intervalLecture * 1000);

  return [this.informationService, this.garageDoorService];
};
