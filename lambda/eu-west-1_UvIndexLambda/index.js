const Alexa = require('ask-sdk-core');
const opencage = require('opencage-api-client');
const i18n = require('i18next');
const sprintf = require('i18next-sprintf-postprocessor');
var openuv = require('openuv')('v1',process.env.OPENUV_API_KEY);
const PERMISSIONS = ['read::alexa:device:all:address:country_and_postal_code'];

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speechText = requestAttributes.t('LAUNCH') + " " + requestAttributes.t('DEFAULT_REPROMPT');

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
      .getResponse();
  },
};

const GetUvIndexIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'GetUvIndexIntent';
  },
  async handle(handlerInput) {
    const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
  

    const consentToken = requestEnvelope.context.System.user.permissions
      && requestEnvelope.context.System.user.permissions.consentToken;
    if (!consentToken) {
      return responseBuilder
        .speak(requestAttributes.t('MISSING_PERMISSIONS'))
        .withAskForPermissionsConsentCard(PERMISSIONS)
        .getResponse();
    }
    try {
      const { deviceId } = requestEnvelope.context.System.device;
      const deviceAddressServiceClient = serviceClientFactory.getDeviceAddressServiceClient();
      let address;
      let response;
      try {
        address = await deviceAddressServiceClient.getCountryAndPostalCode(deviceId);
        console.log('Address successfully retrieved, now responding to user.');
      } catch (error) {
        console.log("error0 " +  error);
        response = responseBuilder.speak(requestAttributes.t('MISSING_PERMISSIONS')).getResponse(); 
      }

      if(address){
        if (address.addressLine1 === null && address.stateOrRegion === null) {
          response = responseBuilder.speak(requestAttributes.t('ADDRESS_NOT_AVAILABLE')).getResponse();
        } else {
          console.log(address);
          let MESSAGE;
          try {
            let geocode = await opencage.geocode({q: address.postalCode, countrycode: address.countryCode});
            if (geocode.status.code == 200) {
              if (geocode.results.length > 0) {
                var place = geocode.results[0];
                console.log(place.formatted);
                console.log(place.geometry);
                try {
                  let data = await openUvGetIndex(place.geometry);
                  console.log(data);
                  let recommendation;
                  if(data.uv_max < 2.5) {
                    recommendation = requestAttributes.t('RECOMMENDATION.1');
                  }else if (data.uv_max < 2.5){
                    recommendation = requestAttributes.t('RECOMMENDATION.2');
                  }else if (data.uv_max < 5.5){
                    recommendation = requestAttributes.t('RECOMMENDATION.3');
                  }else if (data.uv_max < 10.5){
                    recommendation = requestAttributes.t('RECOMMENDATION.4');
                  }else {
                    recommendation = requestAttributes.t('RECOMMENDATION.5');
                  }
                  MESSAGE = requestAttributes.t('UV_INDEX_ACTUAL') + data.uv.toFixed(1) + requestAttributes.t('UV_INDEX_HIGH') + data.uv_max.toFixed(1) + ". " + recommendation;
                } catch (error) {
                  console.log("error3 " + error);
                  MESSAGE = requestAttributes.t('UV_INDEX_ERROR');
                }              
              }
            } else {
              console.log('error1', geocode.status.message);
              MESSAGE = requestAttributes.t('GEOCODE_ERROR');
            }
          } catch (error) {
            console.log('error2', error.message);
            MESSAGE = requestAttributes.t('GEOCODE_ERROR');
          }
          response = responseBuilder.speak(MESSAGE).getResponse();
        }
      }
      return response;
    } catch (error) {
      if (error.name !== 'ServiceError') {
        console.log(error);
        const response = responseBuilder.speak(requestAttributes.t('ADDRESS_ERROR')).getResponse();        
        return response;
      }
      throw error;
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speechText = requestAttributes.t('HELP_MESSAGE');

    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'IntentRequest' && (request.intent.name === 'AMAZON.CancelIntent' || request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    const speechText = requestAttributes.t('STOP_MESSAGE');

    return handlerInput.responseBuilder
      .speak(speechText)
      .getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    return request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    const requestAttributes = handlerInput.attributesManager.getRequestAttributes();
    console.log(`Error handled: ${error.message}`);

    return handlerInput.responseBuilder
      .speak(requestAttributes.t('ERROR_MESSAGE'))
      .reprompt(requestAttributes.t('DEFAULT_REPROMPT'))
      .getResponse();
  },
};

const LocalizationInterceptor = {
  process(handlerInput) {
    const localizationClient = i18n.use(sprintf).init({
      lng: handlerInput.requestEnvelope.request.locale,
      resources: languageStrings,
    });
    localizationClient.localize = function localize() {
      const args = arguments;
      const values = [];
      for (let i = 1; i < args.length; i += 1) {
        values.push(args[i]);
      }
      const value = i18n.t(args[0], {
        returnObjects: true,
        postProcess: 'sprintf',
        sprintf: values,
      });
      if (Array.isArray(value)) {
        return value[Math.floor(Math.random() * value.length)];
      }
      return value;
    };
    const attributes = handlerInput.attributesManager.getRequestAttributes();
    attributes.t = function translate(...args) {
      return localizationClient.localize(...args);
    };
  },
};

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    GetUvIndexIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addRequestInterceptors(LocalizationInterceptor)
  .addErrorHandlers(ErrorHandler)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();

function openUvGetIndex(geometry) {
  return new Promise((resolve, reject) => {
    try {
      openuv.uv({lat: geometry.lat, lng: geometry.lng}, (err, data) => {
        resolve(data);
      });
    } catch (error) {
      console.log("Error in catch of openUvGetIndex(): " + error);
      reject("Could not recieve UV-Index.");
    }
  });
}

const deData = {
  translation: {
    LAUNCH: 'Willkommen bei UV-Index. Hier bekommst du den aktuellen UV-Index.',
    DEFAULT_REPROMPT: 'Wie kann ich dir helfen?',
    HELP_MESSAGE: 'Du kannst sagen, „Nenne mir einen Fakt über den Weltraum“, oder du kannst „Beenden“ sagen... Wie kann ich dir helfen?',
    ERROR_MESSAGE: 'Das habe ich leider nicht verstanden. Bitte versuche es noch einmal.',
    STOP_MESSAGE: 'Bis zum nächsten mal!',
    MISSING_PERMISSIONS: 'Bitte aktiviere die Standort-Berechtigungen für mich in deinen Alexa-Einstellungen.',
    ADDRESS_NOT_AVAILABLE: 'Es sieht so aus als hättest du noch keinen Gerätestandort für dein Alexa-Gerät gesetzt.',
    UV_INDEX_ACTUAL: 'Der aktuelle UV-Index ist: ',
    UV_INDEX_HIGH: ' Der Tageshöchstpunkt ist: ',
    GEOCODE_ERROR: 'Ich konnte deine Adresse nicht ermitteln.',
    UV_INDEX_ERROR: 'Ich konnte den UV-Index für deinen Standort nicht ermitteln.',
    ADDRESS_ERROR: 'Es gab einen Fehler beim ermitteln deines Standorts. Bitte überprüfe die Gerätestandort-Einstellungen für dein Alexa-Gerät.',
    RECOMMENDATION: {
      1: 'Es ist kein besonderer Schutz erforderlich.',
      2: 'Es ist Schutz wie Hut, T-Shirt, Sonnenbrille und Sonnencreme erforderlich.',
      3: 'Es ist Schutz wie Hut, T-Shirt, Sonnenbrille und Sonnencreme erforderlich. Die WHO empfiehlt, mittags den Schatten zu suchen.',
      4: 'Es wird empfohlen den Aufenthalt im Freien möglichst zu vermeiden. Ein sonnendichtes Oberteil, lange Hosen, Sonnencreme, Sonnenbrille und ein Hut werden empfohlen.',
      5: 'Es wird empfohlen den Aufenthalt im Freien möglichst zu vermeiden. Die WHO rät, zwischen 11 und 15 Uhr im Schutz eines Hauses zu bleiben und auch außerhalb dieser Zeit unbedingt Schatten zu suchen. Ein sonnendichtes Oberteil, lange Hosen, Sonnencreme, Sonnenbrille und ein Hut sind unerlässlich.'
    }
  },
};

const dedeData = {
  translation: {
    SKILL_NAME: 'UV-Index auf Deutsch',
  },
};

const languageStrings = {
  'de': deData,
  'de-DE': dedeData
};