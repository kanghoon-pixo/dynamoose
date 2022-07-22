"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const CustomError = require("../Error");
const Schema_1 = require("../Schema");
const Document_1 = require("../Document");
const utils = require("../utils");
const ddb = require("../aws/ddb/internal");
const Internal = require("../Internal");
const Serializer_1 = require("../Serializer");
const DocumentRetriever_1 = require("../DocumentRetriever");
const defaults_1 = require("./defaults");
const index_changes_1 = require("../utils/dynamoose/index_changes");
const Populate_1 = require("../Populate");
var ModelUpdateOptions;
(function (ModelUpdateOptions) {
    ModelUpdateOptions["ttl"] = "ttl";
    ModelUpdateOptions["indexes"] = "indexes";
    ModelUpdateOptions["throughput"] = "throughput";
})(ModelUpdateOptions || (ModelUpdateOptions = {}));
// Utility functions
async function getTableDetails(model, settings = {}) {
    const func = async () => {
        const tableDetails = await ddb("describeTable", { "TableName": model.name });
        model.latestTableDetails = tableDetails; // eslint-disable-line require-atomic-updates
    };
    if (settings.forceRefresh || !model.latestTableDetails) {
        if (settings.allowError) {
            try {
                await func();
            }
            catch (e) { } // eslint-disable-line no-empty
        }
        else {
            await func();
        }
    }
    return model.latestTableDetails;
}
async function createTableRequest(model) {
    return Object.assign(Object.assign({ "TableName": model.name }, utils.dynamoose.get_provisioned_throughput(model.options)), await model.getCreateTableAttributeParams());
}
async function createTable(model) {
    if (((await getTableDetails(model, { "allowError": true }) || {}).Table || {}).TableStatus === "ACTIVE") {
        model.alreadyCreated = true;
        return () => Promise.resolve.bind(Promise)();
    }
    await ddb("createTable", await createTableRequest(model));
}
async function updateTimeToLive(model) {
    let ttlDetails;
    async function updateDetails() {
        ttlDetails = await ddb("describeTimeToLive", {
            "TableName": model.name
        });
    }
    await updateDetails();
    function updateTTL() {
        return ddb("updateTimeToLive", {
            "TableName": model.name,
            "TimeToLiveSpecification": {
                "AttributeName": model.options.expires.attribute,
                "Enabled": true
            }
        });
    }
    switch (ttlDetails.TimeToLiveDescription.TimeToLiveStatus) {
        case "DISABLING":
            while (ttlDetails.TimeToLiveDescription.TimeToLiveStatus === "DISABLING") {
                await utils.timeout(1000);
                await updateDetails();
            }
        // fallthrough
        case "DISABLED":
            await updateTTL();
            break;
        default:
            break;
    }
}
function waitForActive(model, forceRefreshOnFirstAttempt = true) {
    return () => new Promise((resolve, reject) => {
        const start = Date.now();
        async function check(count) {
            var _a;
            try {
                // Normally we'd want to do `dynamodb.waitFor` here, but since it doesn't work with tables that are being updated we can't use it in this case
                const tableDetails = (await getTableDetails(model, { "forceRefresh": forceRefreshOnFirstAttempt === true ? forceRefreshOnFirstAttempt : count > 0 })).Table;
                if (tableDetails.TableStatus === "ACTIVE" && ((_a = tableDetails.GlobalSecondaryIndexes) !== null && _a !== void 0 ? _a : []).every((val) => val.IndexStatus === "ACTIVE")) {
                    return resolve();
                }
            }
            catch (e) {
                return reject(e);
            }
            const checkSettings = typeof model.options.waitForActive === "boolean" ? defaults_1.original.waitForActive.check : model.options.waitForActive.check;
            if (count > 0) {
                checkSettings.frequency === 0 ? await utils.set_immediate_promise() : await utils.timeout(checkSettings.frequency);
            }
            if (Date.now() - start >= checkSettings.timeout) {
                return reject(new CustomError.WaitForActiveTimeout(`Wait for active timed out after ${Date.now() - start} milliseconds.`));
            }
            else {
                check(++count);
            }
        }
        check(0);
    });
}
async function updateTable(model) {
    const updateAll = typeof model.options.update === "boolean" && model.options.update;
    // Throughput
    if (updateAll || model.options.update.includes(ModelUpdateOptions.throughput)) {
        const currentThroughput = (await getTableDetails(model)).Table;
        const expectedThroughput = utils.dynamoose.get_provisioned_throughput(model.options);
        const isThroughputUpToDate = expectedThroughput.BillingMode === (currentThroughput.BillingModeSummary || {}).BillingMode && expectedThroughput.BillingMode || (currentThroughput.ProvisionedThroughput || {}).ReadCapacityUnits === (expectedThroughput.ProvisionedThroughput || {}).ReadCapacityUnits && currentThroughput.ProvisionedThroughput.WriteCapacityUnits === expectedThroughput.ProvisionedThroughput.WriteCapacityUnits;
        if (!isThroughputUpToDate) {
            const object = Object.assign({ "TableName": model.name }, expectedThroughput);
            await ddb("updateTable", object);
            await waitForActive(model)();
        }
    }
    // Indexes
    if (updateAll || model.options.update.includes(ModelUpdateOptions.indexes)) {
        const tableDetails = await getTableDetails(model);
        const existingIndexes = tableDetails.Table.GlobalSecondaryIndexes;
        const updateIndexes = await utils.dynamoose.index_changes(model, existingIndexes);
        await updateIndexes.reduce(async (existingFlow, index) => {
            await existingFlow;
            const params = {
                "TableName": model.name
            };
            if (index.type === index_changes_1.ModelIndexChangeType.add) {
                params.AttributeDefinitions = (await model.getCreateTableAttributeParams()).AttributeDefinitions;
                params.GlobalSecondaryIndexUpdates = [{ "Create": index.spec }];
            }
            else {
                params.GlobalSecondaryIndexUpdates = [{ "Delete": { "IndexName": index.name } }];
            }
            await ddb("updateTable", params);
            await waitForActive(model)();
        }, Promise.resolve());
    }
}
// Model represents one DynamoDB table
class Model {
    constructor(name, schema, options) {
        this.options = utils.combine_objects(options, defaults_1.custom.get(), defaults_1.original);
        this.name = `${this.options.prefix}${name}${this.options.suffix}`;
        this.originalName = name;
        let realSchemas;
        if (!schema || Array.isArray(schema) && schema.length === 0) {
            throw new CustomError.MissingSchemaError(`Schema hasn't been registered for model "${name}".\nUse "dynamoose.model(name, schema)"`);
        }
        else if (!(schema instanceof Schema_1.Schema)) {
            if (Array.isArray(schema)) {
                realSchemas = schema.map((schema) => schema instanceof Schema_1.Schema ? schema : new Schema_1.Schema(schema));
            }
            else {
                realSchemas = [new Schema_1.Schema(schema)];
            }
        }
        else {
            realSchemas = [schema];
        }
        if (!utils.all_elements_match(realSchemas.map((schema) => schema.getHashKey()))) {
            throw new CustomError.InvalidParameter("hashKey's for all schema's must match.");
        }
        if (!utils.all_elements_match(realSchemas.map((schema) => schema.getRangeKey()).filter((key) => Boolean(key)))) {
            throw new CustomError.InvalidParameter("rangeKey's for all schema's must match.");
        }
        if (options.expires) {
            if (typeof options.expires === "number") {
                options.expires = {
                    "attribute": "ttl",
                    "ttl": options.expires
                };
            }
            options.expires = utils.combine_objects(options.expires, { "attribute": "ttl" });
            realSchemas.forEach((schema) => {
                schema.schemaObject[options.expires.attribute] = {
                    "type": {
                        "value": Date,
                        "settings": {
                            "storage": "seconds"
                        }
                    },
                    "default": () => new Date(Date.now() + options.expires.ttl)
                };
            });
        }
        this.schemas = realSchemas;
        // Setup flow
        this.ready = false; // Represents if model is ready to be used for actions such as "get", "put", etc. This property being true does not guarantee anything on the DynamoDB server. It only guarantees that Dynamoose has finished the initalization steps required to allow the model to function as expected on the client side.
        this.alreadyCreated = false; // Represents if the table in DynamoDB was created prior to initalization. This will only be updated if `create` is true.
        this.pendingTasks = []; // Represents an array of promise resolver functions to be called when Model.ready gets set to true (at the end of the setup flow)
        this.latestTableDetails = null; // Stores the latest result from `describeTable` for the given table
        this.pendingTaskPromise = () => {
            return this.ready ? Promise.resolve() : new Promise((resolve) => {
                this.pendingTasks.push(resolve);
            });
        };
        const setupFlow = []; // An array of setup actions to be run in order
        // Create table
        if (this.options.create) {
            setupFlow.push(() => createTable(this));
        }
        // Wait for Active
        if (this.options.waitForActive === true || (this.options.waitForActive || {}).enabled) {
            setupFlow.push(() => waitForActive(this, false));
        }
        // Update Time To Live
        if ((this.options.create || (Array.isArray(this.options.update) ? this.options.update.includes(ModelUpdateOptions.ttl) : this.options.update)) && options.expires) {
            setupFlow.push(() => updateTimeToLive(this));
        }
        // Update
        if (this.options.update && !this.alreadyCreated) {
            setupFlow.push(() => updateTable(this));
        }
        // Run setup flow
        const setupFlowPromise = setupFlow.reduce((existingFlow, flow) => {
            return existingFlow.then(() => flow()).then((flow) => {
                return typeof flow === "function" ? flow() : flow;
            });
        }, Promise.resolve());
        setupFlowPromise.then(() => this.ready = true).then(() => {
            this.pendingTasks.forEach((task) => task());
            this.pendingTasks = [];
        });
        const self = this;
        class Document extends Document_1.Document {
            constructor(object = {}, settings = {}) {
                super(self, utils.deep_copy(object), settings);
            }
        }
        Document.Model = self;
        this.serializer = new Serializer_1.Serializer();
        this.Document = Document;
        this.Document.table = {
            "create": {
                "request": () => createTableRequest(this)
            }
        };
        this.Document.transaction = [
            // `function` Default: `this[key]`
            // `settingsIndex` Default: 1
            // `dynamoKey` Default: utils.capitalize_first_letter(key)
            { "key": "get" },
            { "key": "create", "dynamoKey": "Put" },
            { "key": "delete" },
            { "key": "update", "settingsIndex": 2, "modifier": (response) => {
                    delete response.ReturnValues;
                    return response;
                } },
            { "key": "condition", "settingsIndex": -1, "dynamoKey": "ConditionCheck", "function": (key, condition) => (Object.assign({ "Key": this.Document.objectToDynamo(this.convertObjectToKey(key)), "TableName": this.name }, condition ? condition.requestObject() : {})) }
        ].reduce((accumulator, currentValue) => {
            const { key, modifier } = currentValue;
            const dynamoKey = currentValue.dynamoKey || utils.capitalize_first_letter(key);
            const settingsIndex = currentValue.settingsIndex || 1;
            const func = currentValue.function || this[key].bind(this);
            accumulator[key] = async (...args) => {
                if (typeof args[args.length - 1] === "function") {
                    console.warn("Dynamoose Warning: Passing callback function into transaction method not allowed. Removing callback function from list of arguments.");
                    args.pop();
                }
                if (settingsIndex >= 0) {
                    args[settingsIndex] = utils.merge_objects({ "return": "request" }, args[settingsIndex] || {});
                }
                let result = await func(...args);
                if (modifier) {
                    result = modifier(result);
                }
                return { [dynamoKey]: result };
            };
            return accumulator;
        }, {});
        const ModelStore = require("../ModelStore");
        ModelStore(this);
    }
    // This function returns the best matched schema for the given object input
    async schemaForObject(object) {
        const schemaCorrectnessScores = this.schemas.map((schema) => {
            const typePaths = schema.getTypePaths(object, { "type": "toDynamo", "includeAllProperties": true });
            const multipleTypeKeys = Object.keys(typePaths).filter((key) => typeof typePaths[key] === "number");
            multipleTypeKeys.forEach((key) => {
                // TODO: Ideally at some point we'd move this code into the `schema.getTypePaths` method, but that breaks some other things, so holding off on that for now.
                typePaths[key] = {
                    "index": typePaths[key],
                    "matchCorrectness": 1,
                    "entryCorrectness": [1]
                };
            });
            return typePaths;
        }).map((obj) => Object.values(obj).map((obj) => { var _a; return ((_a = obj) === null || _a === void 0 ? void 0 : _a.matchCorrectness) || 0; })).map((array) => Math.min(...array));
        const highestSchemaCorrectnessScoreIndex = schemaCorrectnessScores.indexOf(Math.max(...schemaCorrectnessScores));
        return this.schemas[highestSchemaCorrectnessScoreIndex];
    }
    async getIndexes() {
        return (await Promise.all(this.schemas.map((schema) => schema.getIndexes(this)))).reduce((result, indexes) => {
            Object.entries(indexes).forEach(([key, value]) => {
                if (key === "TableIndex") {
                    result[key] = value;
                }
                else {
                    result[key] = result[key] ? utils.unique_array_elements([...result[key], ...value]) : value;
                }
            });
            return result;
        }, {});
    }
    async getCreateTableAttributeParams() {
        // TODO: implement this
        return this.schemas[0].getCreateTableAttributeParams(this);
    }
    getHashKey() {
        return this.schemas[0].getHashKey();
    }
    getRangeKey() {
        return this.schemas[0].getRangeKey();
    }
    convertObjectToKey(key) {
        let keyObject;
        const hashKey = this.getHashKey();
        if (typeof key === "object") {
            const rangeKey = this.getRangeKey();
            keyObject = {
                [hashKey]: key[hashKey]
            };
            if (rangeKey && typeof key[rangeKey] !== "undefined" && key[rangeKey] !== null) {
                keyObject[rangeKey] = key[rangeKey];
            }
        }
        else {
            keyObject = {
                [hashKey]: key
            };
        }
        return keyObject;
    }
    batchGet(keys, settings, callback) {
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": "documents" };
        }
        if (typeof settings === "undefined") {
            settings = { "return": "documents" };
        }
        const keyObjects = keys.map((key) => this.convertObjectToKey(key));
        const documentify = (document) => new this.Document(document, { "type": "fromDynamo" }).conformToSchema({ "customTypesDynamo": true, "checkExpiredItem": true, "saveUnknown": true, "modifiers": ["get"], "type": "fromDynamo" });
        const prepareResponse = async (response) => {
            const tmpResult = await Promise.all(response.Responses[this.name].map((item) => documentify(item)));
            const unprocessedArray = response.UnprocessedKeys[this.name] ? response.UnprocessedKeys[this.name].Keys : [];
            const tmpResultUnprocessed = await Promise.all(unprocessedArray.map((item) => this.Document.fromDynamo(item)));
            const startArray = Object.assign([], {
                "unprocessedKeys": [],
                "populate": Populate_1.PopulateDocuments,
                "toJSON": utils.dynamoose.documentToJSON
            });
            return keyObjects.reduce((result, key) => {
                const keyProperties = Object.keys(key);
                const item = tmpResult.find((item) => keyProperties.every((keyProperty) => item[keyProperty] === key[keyProperty]));
                if (item) {
                    result.push(item);
                }
                else {
                    const item = tmpResultUnprocessed.find((item) => keyProperties.every((keyProperty) => item[keyProperty] === key[keyProperty]));
                    if (item) {
                        result.unprocessedKeys.push(item);
                    }
                }
                return result;
            }, startArray);
        };
        const params = {
            "RequestItems": {
                [this.name]: {
                    "Keys": keyObjects.map((key) => this.Document.objectToDynamo(key))
                }
            }
        };
        if (settings.attributes) {
            params.RequestItems[this.name].AttributesToGet = settings.attributes;
        }
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                localCallback(null, params);
                return;
            }
            else {
                return params;
            }
        }
        const promise = this.pendingTaskPromise().then(() => ddb("batchGetItem", params));
        if (callback) {
            const localCallback = callback;
            promise.then((response) => prepareResponse(response)).then((response) => localCallback(null, response)).catch((error) => localCallback(error));
        }
        else {
            return (async () => {
                const response = await promise;
                return prepareResponse(response);
            })();
        }
    }
    batchPut(documents, settings, callback) {
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": "response" };
        }
        if (typeof settings === "undefined") {
            settings = { "return": "response" };
        }
        const prepareResponse = async (response) => {
            const unprocessedArray = response.UnprocessedItems && response.UnprocessedItems[this.name] ? response.UnprocessedItems[this.name] : [];
            const tmpResultUnprocessed = await Promise.all(unprocessedArray.map((item) => this.Document.fromDynamo(item.PutRequest.Item)));
            return documents.reduce((result, document) => {
                const item = tmpResultUnprocessed.find((item) => Object.keys(document).every((keyProperty) => item[keyProperty] === document[keyProperty]));
                if (item) {
                    result.unprocessedItems.push(item);
                }
                return result;
            }, { "unprocessedItems": [] });
        };
        const paramsPromise = (async () => ({
            "RequestItems": {
                [this.name]: await Promise.all(documents.map(async (document) => ({
                    "PutRequest": {
                        "Item": await new this.Document(document).toDynamo({ "defaults": true, "validate": true, "required": true, "enum": true, "forceDefault": true, "saveUnknown": true, "combine": true, "customTypesDynamo": true, "updateTimestamps": true, "modifiers": ["set"] })
                    }
                })))
            }
        }))();
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                paramsPromise.then((result) => localCallback(null, result));
                return;
            }
            else {
                return paramsPromise;
            }
        }
        const promise = this.pendingTaskPromise().then(() => paramsPromise).then((params) => ddb("batchWriteItem", params));
        if (callback) {
            const localCallback = callback;
            promise.then((response) => prepareResponse(response)).then((response) => localCallback(null, response)).catch((error) => callback(error));
        }
        else {
            return (async () => {
                const response = await promise;
                return prepareResponse(response);
            })();
        }
    }
    batchDelete(keys, settings, callback) {
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": "response" };
        }
        if (typeof settings === "undefined") {
            settings = { "return": "response" };
        }
        const keyObjects = keys.map((key) => this.convertObjectToKey(key));
        const prepareResponse = async (response) => {
            const unprocessedArray = response.UnprocessedItems && response.UnprocessedItems[this.name] ? response.UnprocessedItems[this.name] : [];
            const tmpResultUnprocessed = await Promise.all(unprocessedArray.map((item) => this.Document.fromDynamo(item.DeleteRequest.Key)));
            return keyObjects.reduce((result, key) => {
                const item = tmpResultUnprocessed.find((item) => Object.keys(key).every((keyProperty) => item[keyProperty] === key[keyProperty]));
                if (item) {
                    result.unprocessedItems.push(item);
                }
                return result;
            }, { "unprocessedItems": [] });
        };
        const params = {
            "RequestItems": {
                [this.name]: keyObjects.map((key) => ({
                    "DeleteRequest": {
                        "Key": this.Document.objectToDynamo(key)
                    }
                }))
            }
        };
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                localCallback(null, params);
                return;
            }
            else {
                return params;
            }
        }
        const promise = this.pendingTaskPromise().then(() => ddb("batchWriteItem", params));
        if (callback) {
            const localCallback = callback;
            promise.then((response) => prepareResponse(response)).then((response) => localCallback(null, response)).catch((error) => localCallback(error));
        }
        else {
            return (async () => {
                const response = await promise;
                return prepareResponse(response);
            })();
        }
    }
    update(keyObj, updateObj, settings, callback) {
        if (typeof updateObj === "function") {
            callback = updateObj; // TODO: fix this, for some reason `updateObj` has a type of Function which is forcing us to type cast it
            updateObj = null;
            settings = { "return": "document" };
        }
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": "document" };
        }
        if (!updateObj) {
            const hashKeyName = this.getHashKey();
            updateObj = utils.deep_copy(keyObj);
            keyObj = {
                [hashKeyName]: keyObj[hashKeyName]
            };
            delete updateObj[hashKeyName];
            const rangeKeyName = this.getRangeKey();
            if (rangeKeyName) {
                keyObj[rangeKeyName] = updateObj[rangeKeyName];
                delete updateObj[rangeKeyName];
            }
        }
        if (typeof settings === "undefined") {
            settings = { "return": "document" };
        }
        const schema = this.schemas[0]; // TODO: fix this to get correct schema
        let index = 0;
        const getUpdateExpressionObject = async () => {
            const updateTypes = [
                { "name": "$SET", "operator": " = ", "objectFromSchemaSettings": { "validate": true, "enum": true, "forceDefault": true, "required": "nested", "modifiers": ["set"] } },
                { "name": "$ADD", "objectFromSchemaSettings": { "forceDefault": true } },
                { "name": "$REMOVE", "attributeOnly": true, "objectFromSchemaSettings": { "required": true, "defaults": true } },
                { "name": "$DELETE", "objectFromSchemaSettings": { "defaults": true } }
            ].reverse();
            const returnObject = await Object.keys(updateObj).reduce(async (accumulatorPromise, key) => {
                const accumulator = await accumulatorPromise;
                let value = updateObj[key];
                if (!(typeof value === "object" && updateTypes.map((a) => a.name).includes(key))) {
                    value = { [key]: value };
                    key = "$SET";
                }
                const valueKeys = Object.keys(value);
                for (let i = 0; i < valueKeys.length; i++) {
                    let subKey = valueKeys[i];
                    let subValue = value[subKey];
                    let updateType = updateTypes.find((a) => a.name === key);
                    const expressionKey = `#a${index}`;
                    subKey = Array.isArray(value) ? subValue : subKey;
                    let dynamoType;
                    try {
                        dynamoType = schema.getAttributeType(subKey, subValue, { "unknownAttributeAllowed": true });
                    }
                    catch (e) { } // eslint-disable-line no-empty
                    const attributeExists = schema.attributes().includes(subKey);
                    const dynamooseUndefined = require("../index").UNDEFINED;
                    if (!updateType.attributeOnly && subValue !== dynamooseUndefined) {
                        subValue = (await this.Document.objectFromSchema({ [subKey]: dynamoType === "L" && !Array.isArray(subValue) ? [subValue] : subValue }, this, Object.assign({ "type": "toDynamo", "customTypesDynamo": true, "saveUnknown": true }, updateType.objectFromSchemaSettings)))[subKey];
                    }
                    if (subValue === dynamooseUndefined || subValue === undefined) {
                        if (attributeExists) {
                            updateType = updateTypes.find((a) => a.name === "$REMOVE");
                        }
                        else {
                            continue;
                        }
                    }
                    if (subValue !== dynamooseUndefined) {
                        const defaultValue = await schema.defaultCheck(subKey, undefined, updateType.objectFromSchemaSettings);
                        if (defaultValue) {
                            subValue = defaultValue;
                            updateType = updateTypes.find((a) => a.name === "$SET");
                        }
                    }
                    if (updateType.objectFromSchemaSettings.required === true) {
                        await schema.requiredCheck(subKey, undefined);
                    }
                    let expressionValue = updateType.attributeOnly ? "" : `:v${index}`;
                    accumulator.ExpressionAttributeNames[expressionKey] = subKey;
                    if (!updateType.attributeOnly) {
                        accumulator.ExpressionAttributeValues[expressionValue] = subValue;
                    }
                    if (dynamoType === "L" && updateType.name === "$ADD") {
                        expressionValue = `list_append(${expressionKey}, ${expressionValue})`;
                        updateType = updateTypes.find((a) => a.name === "$SET");
                    }
                    const operator = updateType.operator || (updateType.attributeOnly ? "" : " ");
                    accumulator.UpdateExpression[updateType.name.slice(1)].push(`${expressionKey}${operator}${expressionValue}`);
                    index++;
                }
                return accumulator;
            }, Promise.resolve((async () => {
                const obj = {
                    "ExpressionAttributeNames": {},
                    "ExpressionAttributeValues": {},
                    "UpdateExpression": updateTypes.map((a) => a.name).reduce((accumulator, key) => {
                        accumulator[key.slice(1)] = [];
                        return accumulator;
                    }, {})
                };
                const documentFunctionSettings = { "updateTimestamps": { "updatedAt": true }, "customTypesDynamo": true, "type": "toDynamo" };
                const defaultObjectFromSchema = await this.Document.objectFromSchema(await this.Document.prepareForObjectFromSchema({}, this, documentFunctionSettings), this, documentFunctionSettings);
                Object.keys(defaultObjectFromSchema).forEach((key) => {
                    const value = defaultObjectFromSchema[key];
                    const updateType = updateTypes.find((a) => a.name === "$SET");
                    obj.ExpressionAttributeNames[`#a${index}`] = key;
                    obj.ExpressionAttributeValues[`:v${index}`] = value;
                    obj.UpdateExpression[updateType.name.slice(1)].push(`#a${index}${updateType.operator}:v${index}`);
                    index++;
                });
                return obj;
            })()));
            schema.attributes().map((attribute) => ({ attribute, "type": schema.getAttributeTypeDetails(attribute) })).filter((item) => {
                return Array.isArray(item.type) ? item.type.some((type) => type.name === "Combine") : item.type.name === "Combine";
            }).map((details) => {
                const { type } = details;
                if (Array.isArray(type)) {
                    throw new CustomError.InvalidParameter("Combine type is not allowed to be used with multiple types.");
                }
                return details;
            }).forEach((details) => {
                const { invalidAttributes } = details.type.typeSettings.attributes.reduce((result, attribute) => {
                    const expressionAttributeNameEntry = Object.entries(returnObject.ExpressionAttributeNames).find((entry) => entry[1] === attribute);
                    const doesExist = Boolean(expressionAttributeNameEntry);
                    const isValid = doesExist && [...returnObject.UpdateExpression.SET, ...returnObject.UpdateExpression.REMOVE].join(", ").includes(expressionAttributeNameEntry[0]);
                    if (!isValid) {
                        result.invalidAttributes.push(attribute);
                    }
                    return result;
                }, { "invalidAttributes": [] });
                if (invalidAttributes.length > 0) {
                    throw new CustomError.InvalidParameter(`You must update all or none of the combine attributes when running Model.update. Missing combine attributes: ${invalidAttributes.join(", ")}.`);
                }
                else {
                    const nextIndex = Math.max(...Object.keys(returnObject.ExpressionAttributeNames).map((key) => parseInt(key.replace("#a", "")))) + 1;
                    returnObject.ExpressionAttributeNames[`#a${nextIndex}`] = details.attribute;
                    returnObject.ExpressionAttributeValues[`:v${nextIndex}`] = details.type.typeSettings.attributes.map((attribute) => {
                        const [expressionAttributeNameKey] = Object.entries(returnObject.ExpressionAttributeNames).find((entry) => entry[1] === attribute);
                        return returnObject.ExpressionAttributeValues[expressionAttributeNameKey.replace("#a", ":v")];
                    }).filter((value) => typeof value !== "undefined" && value !== null).join(details.type.typeSettings.seperator);
                    returnObject.UpdateExpression.SET.push(`#a${nextIndex} = :v${nextIndex}`);
                }
            });
            await Promise.all(schema.attributes().map(async (attribute) => {
                const defaultValue = await schema.defaultCheck(attribute, undefined, { "forceDefault": true });
                if (defaultValue && !Object.values(returnObject.ExpressionAttributeNames).includes(attribute)) {
                    const updateType = updateTypes.find((a) => a.name === "$SET");
                    returnObject.ExpressionAttributeNames[`#a${index}`] = attribute;
                    returnObject.ExpressionAttributeValues[`:v${index}`] = defaultValue;
                    returnObject.UpdateExpression[updateType.name.slice(1)].push(`#a${index}${updateType.operator}:v${index}`);
                    index++;
                }
            }));
            Object.values(returnObject.ExpressionAttributeNames).map((attribute, index) => {
                const value = Object.values(returnObject.ExpressionAttributeValues)[index];
                const valueKey = Object.keys(returnObject.ExpressionAttributeValues)[index];
                let dynamoType;
                try {
                    dynamoType = schema.getAttributeType(attribute, value, { "unknownAttributeAllowed": true });
                }
                catch (e) { } // eslint-disable-line no-empty
                const attributeType = Schema_1.Schema.attributeTypes.findDynamoDBType(dynamoType);
                if ((attributeType === null || attributeType === void 0 ? void 0 : attributeType.toDynamo) && !attributeType.isOfType(value, "fromDynamo")) {
                    returnObject.ExpressionAttributeValues[valueKey] = attributeType.toDynamo(value);
                }
            });
            returnObject.ExpressionAttributeValues = this.Document.objectToDynamo(returnObject.ExpressionAttributeValues);
            if (Object.keys(returnObject.ExpressionAttributeValues).length === 0) {
                delete returnObject.ExpressionAttributeValues;
            }
            return Object.assign(Object.assign({}, returnObject), { "UpdateExpression": Object.keys(returnObject.UpdateExpression).reduce((accumulator, key) => {
                    const value = returnObject.UpdateExpression[key];
                    if (value.length > 0) {
                        return `${accumulator}${accumulator.length > 0 ? " " : ""}${key} ${value.join(", ")}`;
                    }
                    else {
                        return accumulator;
                    }
                }, "") });
        };
        const documentify = (document) => new this.Document(document, { "type": "fromDynamo" }).conformToSchema({ "customTypesDynamo": true, "checkExpiredItem": true, "type": "fromDynamo", "saveUnknown": true });
        const localSettings = settings;
        const updateItemParamsPromise = this.pendingTaskPromise().then(async () => (Object.assign(Object.assign({ "Key": this.Document.objectToDynamo(this.convertObjectToKey(keyObj)), "ReturnValues": localSettings.returnValues || "ALL_NEW" }, utils.merge_objects.main({ "combineMethod": "object_combine" })(localSettings.condition ? localSettings.condition.requestObject({ "index": { "start": index, "set": (i) => {
                    index = i;
                } }, "conditionString": "ConditionExpression", "conditionStringType": "string" }) : {}, await getUpdateExpressionObject())), { "TableName": this.name })));
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                updateItemParamsPromise.then((params) => localCallback(null, params));
                return;
            }
            else {
                return updateItemParamsPromise;
            }
        }
        const promise = updateItemParamsPromise.then((params) => ddb("updateItem", params));
        if (callback) {
            promise.then((response) => response.Attributes ? documentify(response.Attributes) : undefined).then((response) => callback(null, response)).catch((error) => callback(error));
        }
        else {
            return (async () => {
                const response = await promise;
                return response.Attributes ? await documentify(response.Attributes) : undefined;
            })();
        }
    }
    create(document, settings, callback) {
        if (typeof settings === "function" && !callback) {
            callback = settings;
            settings = {};
        }
        return new this.Document(document).save(Object.assign({ "overwrite": false }, settings), callback);
    }
    delete(key, settings, callback) {
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": null };
        }
        if (typeof settings === "undefined") {
            settings = { "return": null };
        }
        if (typeof settings === "object" && !settings.return) {
            settings = Object.assign(Object.assign({}, settings), { "return": null });
        }
        let deleteItemParams = {
            "Key": this.Document.objectToDynamo(this.convertObjectToKey(key)),
            "TableName": this.name
        };
        if (settings.condition) {
            deleteItemParams = Object.assign(Object.assign({}, deleteItemParams), settings.condition.requestObject());
        }
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                localCallback(null, deleteItemParams);
                return;
            }
            else {
                return deleteItemParams;
            }
        }
        const promise = this.pendingTaskPromise().then(() => ddb("deleteItem", deleteItemParams));
        if (callback) {
            promise.then(() => callback()).catch((error) => callback(error));
        }
        else {
            return (async () => {
                await promise;
            })();
        }
    }
    get(key, settings, callback) {
        if (typeof settings === "function") {
            callback = settings;
            settings = { "return": "document" };
        }
        if (typeof settings === "undefined") {
            settings = { "return": "document" };
        }
        const conformToSchemaSettings = { "customTypesDynamo": true, "checkExpiredItem": true, "saveUnknown": true, "modifiers": ["get"], "type": "fromDynamo" };
        const documentify = (document) => new this.Document(document, { "type": "fromDynamo" }).conformToSchema(conformToSchemaSettings);
        const getItemParams = {
            "Key": this.Document.objectToDynamo(this.convertObjectToKey(key)),
            "TableName": this.name
        };
        if (settings.consistent !== undefined && settings.consistent !== null) {
            getItemParams.ConsistentRead = settings.consistent;
        }
        if (settings.attributes) {
            getItemParams.ProjectionExpression = settings.attributes.map((attribute, index) => `#a${index}`).join(", ");
            getItemParams.ExpressionAttributeNames = settings.attributes.reduce((accumulator, currentValue, index) => (accumulator[`#a${index}`] = currentValue, accumulator), {});
        }
        if (settings.return === "request") {
            if (callback) {
                const localCallback = callback;
                localCallback(null, getItemParams);
                return;
            }
            else {
                return getItemParams;
            }
        }
        const promise = this.pendingTaskPromise().then(() => ddb("getItem", getItemParams));
        if (callback) {
            const localCallback = callback;
            promise.then((response) => response.Item ? documentify(response.Item) : undefined).then((response) => localCallback(null, response)).catch((error) => callback(error));
        }
        else {
            return (async () => {
                const response = await promise;
                return response.Item ? await documentify(response.Item) : undefined;
            })();
        }
    }
    // Serialize Many
    serializeMany(documentsArray = [], nameOrOptions) {
        return this.serializer._serializeMany(documentsArray, nameOrOptions);
    }
}
exports.Model = Model;
Model.defaults = defaults_1.original;
Model.prototype.scan = function (object) {
    return new DocumentRetriever_1.Scan(this, object);
};
Model.prototype.query = function (object) {
    return new DocumentRetriever_1.Query(this, object);
};
// Methods
const customMethodFunctions = (type) => {
    const entryPoint = (self) => type === "document" ? self.Document.prototype : self.Document;
    return {
        "set": function (name, fn) {
            const self = this;
            if (!entryPoint(self)[name] || entryPoint(self)[name][Internal.General.internalProperties] && entryPoint(self)[name][Internal.General.internalProperties].type === "customMethod") {
                entryPoint(self)[name] = function (...args) {
                    const bindObject = type === "document" ? this : self.Document;
                    const cb = typeof args[args.length - 1] === "function" ? args[args.length - 1] : undefined;
                    if (cb) {
                        const result = fn.bind(bindObject)(...args);
                        if (result instanceof Promise) {
                            result.then((result) => cb(null, result)).catch((err) => cb(err));
                        }
                    }
                    else {
                        return new Promise((resolve, reject) => {
                            const result = fn.bind(bindObject)(...args, (err, result) => {
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    resolve(result);
                                }
                            });
                            if (result instanceof Promise) {
                                result.then(resolve).catch(reject);
                            }
                        });
                    }
                };
                entryPoint(self)[name][Internal.General.internalProperties] = { "type": "customMethod" };
            }
        },
        "delete": function (name) {
            const self = this;
            if (entryPoint(self)[name] && entryPoint(self)[name][Internal.General.internalProperties] && entryPoint(self)[name][Internal.General.internalProperties].type === "customMethod") {
                entryPoint(self)[name] = undefined;
            }
        }
    };
};
Model.prototype.methods = Object.assign(Object.assign({}, customMethodFunctions("model")), { "document": customMethodFunctions("document") });
//# sourceMappingURL=index.js.map