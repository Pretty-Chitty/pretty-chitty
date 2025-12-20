class TestClass {
    constructor() {
        this.requiredProp = "test";
        this.optionalWithInit = undefined;
        this.explicitUndefined = undefined;
    }
}
const instance = new TestClass();
console.log("Object.keys:", Object.keys(instance));
console.log("hasOwnProperty requiredProp:", instance.hasOwnProperty("requiredProp"));
console.log("hasOwnProperty optionalWithInit:", instance.hasOwnProperty("optionalWithInit"));
console.log("hasOwnProperty optionalNoInit:", instance.hasOwnProperty("optionalNoInit"));
console.log("hasOwnProperty explicitUndefined:", instance.hasOwnProperty("explicitUndefined"));
