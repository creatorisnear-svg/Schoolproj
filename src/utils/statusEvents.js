import { EventEmitter } from 'events';

const statusEvents = new EventEmitter();
statusEvents.setMaxListeners(200);

export default statusEvents;
