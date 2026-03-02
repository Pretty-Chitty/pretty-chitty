import { ConnectionObject } from "./ConnectionObject";
import { ConnectionTransport } from "./ConnectionTransport";

type Message = {
  name: string;
  fnName: string;
  requestId: number;
  args: any[];
  isResponse: boolean;
  response: any;
  errorMessage: string;
};

export class Connection {
  private disposed = false;
  private requestCounter = 0;
  private actualConnectionObjects: ConnectionObject[] = [];
  private registry: { [name: string]: object } = {};
  private requestRegistry: { [id: number]: { resolve: (a: any) => void; reject: (message: string) => void } } = {};
  private unprocessableMessages: Message[] = [];

  constructor(public transport: ConnectionTransport) {
    this.transport.onReceiveMessage((message) => {
      if (this.disposed) {
        return;
      }
      this.handleMessage(message);
    });
  }

  handleMessage(message: Message) {
    const { name, fnName, requestId, args, isResponse, errorMessage, response } = message;

    if (isResponse) {
      const { resolve, reject } = this.requestRegistry[requestId];
      if (!resolve) {
        throw new Error("Cannot find requestId");
      }
      delete this.requestRegistry[requestId];

      if (errorMessage) {
        reject(errorMessage);
      } else {
        resolve(response);
      }
    } else {
      const obj = this.registry[name] as any;
      if (!obj) {
        this.unprocessableMessages.push(message);
        return;
      }
      const fn = obj[fnName];
      if (!fn) {
        throw new Error(`${fn} is not found`);
      }

      try {
        fn.apply(obj, args)
          .then((response: any) => {
            this.transport.sendMessage({ requestId, response, isResponse: true });
          })
          .catch((error: Error) => {
            console.error(error);
            this.transport.sendMessage({ requestId, errorMessage: error.message ?? error, isResponse: true });
          });
      } catch (error) {
        console.error(error);
        this.transport.sendMessage({
          requestId,
          errorMessage: error instanceof Error ? error.message : error,
          isResponse: true,
        });
      }
    }
  }

  dispose() {
    this.disposed = true;
    Object.values(this.requestRegistry).forEach(({ reject }) => reject("Connection disposed"));
    this.requestRegistry = {};
    this.actualConnectionObjects.forEach((conn) => conn.dispose());
  }

  register<T extends ConnectionObject>(instance: T, name?: string) {
    if (!name) {
      name = Object.getPrototypeOf(instance).constructor.name;
    }
    if (!name) {
      throw new Error("Name must be specified");
    }

    this.registry[name] = instance;
    this.actualConnectionObjects.push(instance);

    const messagesToProcess = this.unprocessableMessages;
    this.unprocessableMessages = [];
    messagesToProcess.forEach((message) => this.handleMessage(message));
  }

  // wish we didn't have to pass "name" in here... but
  // javascript is javascript
  get<T>(name: string): T {
    let result = this.registry[name];
    if (!result) {
      result = new Proxy(
        {},
        {
          get: (target, prop) => {
            return (...args: any) => {
              if (this.disposed) {
                return Promise.reject("Connection disposed");
              }

              const fnName = prop;
              const requestId = this.requestCounter++;
              const result = new Promise((resolve, reject) => {
                this.requestRegistry[requestId] = { resolve, reject };
              });

              try {
                this.transport.sendMessage({
                  name,
                  fnName,
                  requestId,
                  args,
                  isResponse: false,
                });
              } catch (e) {
                delete this.requestRegistry[requestId];
                return Promise.reject(e);
              }

              return result;
            };
          },
        },
      );
    }
    return result as T;
  }
}
