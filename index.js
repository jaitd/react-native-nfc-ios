import { NativeEventEmitter,  NativeModules } from 'react-native';

const { ReactNativeNfcIos: nativeModule } = NativeModules;

const _nfcNDEFReaderSessions = {};
const listeners = {};

export const EMPTY_RECORD = 'EMPTY_RECORD';
export const WELL_KNOWN_RECORD = 'WELL_KNOWN_RECORD';
export const MIME_MEDIA_RECORD = 'MIME_MEDIA_RECORD';
export const ABSOLUTE_URI_RECORD = 'ABSOLUTE_URI_RECORD';
export const EXTERNAL_RECORD = 'EXTERNAL_RECORD';
export const UNKNOWN_RECORD = 'UNKNOWN_RECORD';
export const UNCHANGED_RECORD = 'UNCHANGED_RECORD';

const recordTypes = {
  0: EMPTY_RECORD,
  1: WELL_KNOWN_RECORD,
  2: MIME_MEDIA_RECORD,
  3: ABSOLUTE_URI_RECORD,
  4: EXTERNAL_RECORD,
  5: UNKNOWN_RECORD,
  6: UNCHANGED_RECORD,
};

const EVENT_MESSAGES = 'NDEFMessages';
const EVENT_ERRORS = 'NDEFError';

let nextInstanceId = 0;
function genInstanceId() {
  const id = nextInstanceId;
  nextInstanceId += 1;
  return id;
}

function decode(base64Data) {
  if (base64Data !== "") {
    return base64.decode(base64Data);
  }

  return base64Data;
}

function formatRecord(record) {
  return {
    type: record.type || null,
    typeNameFormat: recordTypes[record.typeNameFormat],
    identifier: record.identifier || null,
    payload: record.payload || null,
  };
}

function formatMessage(message) {
  return {
    records: message.records.map(formatRecord),
  };
}

const eventEmitter = new NativeEventEmitter(nativeModule);
eventEmitter.addListener(EVENT_MESSAGES, (event) => {
  if (__DEV__) {
    console.log({ event });
  }
  const session = _nfcNDEFReaderSessions[event.sessionId];
  if (session) {
    session.emit(EVENT_MESSAGES, event.messages.map(formatMessage));
  }
});

eventEmitter.addListener(EVENT_ERRORS, (event) => {
  if (__DEV__) {
    console.log({ event });
  }
  const session = _nfcNDEFReaderSessions[event.sessionId];
  if (session) {
    session.emit(EVENT_ERRORS, event.error);
  }
});

export class NFCNDEFReaderSession {
  constructor({ alertMessage = null, invalidateAfterFirstRead = false } = {}) {
    // ID generated to multiplex session messages over native event emitter
    this.id = genInstanceId();

    // iOS NFCNDEFReaderSession options
    this.alertMessage = alertMessage
    this.invalidateAfterFirstRead = invalidateAfterFirstRead;

    // Event listeners for this session
    this.listenersForType = {
      [EVENT_MESSAGES]: [],
      [EVENT_ERRORS]: []
    };

    _nfcNDEFReaderSessions[this.id] = this;
    nativeModule.createNFCNDEFReaderSession(this.id, this.invalidateAfterFirstRead, this.alertMessage);
  }

  static readingAvailable = nativeModule.NFCNDEFReaderSession_readingAvailable;

  static readTag({ alertMessage } = {}) {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const session = new NFCNDEFReaderSession({ alertMessage, invalidateAfterFirstRead: true });

      const listener = (messages) => {
        if (!resolved) {
          resolved = true;
        } else {
          return;
        }

        resolve(messages);

        session.removeEventListener(EVENT_MESSAGES, listener);
        session.removeEventListener(EVENT_ERRORS, errorListener);

        session.release();
      }
      const errorListener = (error) => {
        if (!resolved) {
          resolved = true;
        } else {
          return;
        }

        reject(error);

        session.removeEventListener(EVENT_MESSAGES, listener);
        session.removeEventListener(EVENT_ERRORS, errorListener);

        session.release();
      }

      session.addEventListener(EVENT_MESSAGES, listener);
      session.addEventListener(EVENT_ERRORS, errorListener);

      session.begin();
    });
  }

  ensureExists() {
    if (!_nfcNDEFReaderSessions[this.id]) {
      throw new Error('Session does not exist anymore.')
    }
  }

  release() {
    nativeModule.NFCNDEFReaderSession_release(this.id);
    delete _nfcNDEFReaderSessions[this.id];
  }

  begin() {
    this.ensureExists();
    nativeModule.NFCNDEFReaderSession_begin(this.id);
  }

  invalidate() {
    this.ensureExists();
    nativeModule.NFCNDEFReaderSession_invalidate(this.id);
  }

  setAlertMessage(alertMessage) {
    this.ensureExists();
    this.alertMessage = alertMessage;
    nativeModule.NFCNDEFReaderSession_setAlertMessage(this.id, this.alertMessage);
  }

  addEventListener(eventType, listener) {
    const listeners = this.listenersForType[eventType];
    if (!Array.isArray(listeners)) {
      throw new Error(`Event type ${eventType} is not supported`);
    }

    this.listenersForType[eventType].push(listener);

    return true;
  }

  removeEventListener(eventType, listener) {
    const listeners = this.listenersForType[eventType];
    if (!Array.isArray(listeners)) {
      throw new Error(`Event type ${eventType} is not supported`);
    }

    const listenerIndex = listeners.indexOf(listener);
    if (listenerIndex === -1) {
      throw new Error('Cannot find event listener');
    }

    listeners.splice(listenerIndex, 1);

    return true;
  }

  removeAllListeners(eventType) {
    this.listenersForType[eventType] = [];
    return true;
  }

  emit(eventType, event) {
    for (const listener of this.listenersForType[eventType]) {
      listener(event);
    }
  }
}
