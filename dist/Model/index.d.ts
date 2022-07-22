import { Schema, SchemaDefinition, IndexItem, TableIndex } from "../Schema";
import { Document as DocumentCarrier, DocumentSaveSettings, AnyDocument } from "../Document";
import { Serializer, SerializerOptions } from "../Serializer";
import { Condition, ConditionInitalizer } from "../Condition";
import { Scan, Query } from "../DocumentRetriever";
import { CallbackType, ObjectType, FunctionType, DocumentArray, ModelType, DeepPartial } from "../General";
import { DynamoDB, AWSError } from "aws-sdk";
import { GetTransactionInput, CreateTransactionInput, DeleteTransactionInput, UpdateTransactionInput, ConditionTransactionInput } from "../Transaction";
interface ModelWaitForActiveCheckSettings {
    timeout: number;
    frequency: number;
}
interface ModelWaitForActiveSettings {
    enabled: boolean;
    check: ModelWaitForActiveCheckSettings;
}
export interface ModelExpiresSettings {
    ttl: number;
    attribute: string;
    items?: {
        returnExpired: boolean;
    };
}
declare enum ModelUpdateOptions {
    ttl = "ttl",
    indexes = "indexes",
    throughput = "throughput"
}
export interface ModelOptions {
    create: boolean;
    throughput: "ON_DEMAND" | number | {
        read: number;
        write: number;
    };
    prefix: string;
    suffix: string;
    waitForActive: boolean | ModelWaitForActiveSettings;
    update: boolean | ModelUpdateOptions[];
    populate: string | string[] | boolean;
    expires: number | ModelExpiresSettings;
}
export declare type ModelOptionsOptional = DeepPartial<ModelOptions>;
declare type KeyObject = {
    [attribute: string]: string | number;
};
declare type InputKey = string | number | KeyObject;
declare type GetTransactionResult = Promise<GetTransactionInput>;
declare type CreateTransactionResult = Promise<CreateTransactionInput>;
declare type DeleteTransactionResult = Promise<DeleteTransactionInput>;
declare type UpdateTransactionResult = Promise<UpdateTransactionInput>;
declare type ConditionTransactionResult = Promise<ConditionTransactionInput>;
export interface GetTransaction {
    (key: InputKey): GetTransactionResult;
    (key: InputKey, settings?: ModelGetSettings): GetTransactionResult;
    (key: InputKey, settings: ModelGetSettings & {
        return: "document";
    }): GetTransactionResult;
    (key: InputKey, settings: ModelGetSettings & {
        return: "request";
    }): GetTransactionResult;
}
export interface CreateTransaction {
    (document: ObjectType): CreateTransactionResult;
    (document: ObjectType, settings: DocumentSaveSettings & {
        return: "request";
    }): CreateTransactionResult;
    (document: ObjectType, settings: DocumentSaveSettings & {
        return: "document";
    }): CreateTransactionResult;
    (document: ObjectType, settings?: DocumentSaveSettings): CreateTransactionResult;
}
export interface DeleteTransaction {
    (key: InputKey): DeleteTransactionResult;
    (key: InputKey, settings: ModelDeleteSettings & {
        return: "request";
    }): DeleteTransactionResult;
    (key: InputKey, settings: ModelDeleteSettings & {
        return: null;
    }): DeleteTransactionResult;
    (key: InputKey, settings?: ModelDeleteSettings): DeleteTransactionResult;
}
export interface UpdateTransaction {
    (obj: ObjectType): CreateTransactionResult;
    (keyObj: ObjectType, updateObj: ObjectType): UpdateTransactionResult;
    (keyObj: ObjectType, updateObj: ObjectType, settings: ModelUpdateSettings & {
        "return": "document";
    }): UpdateTransactionResult;
    (keyObj: ObjectType, updateObj: ObjectType, settings: ModelUpdateSettings & {
        "return": "request";
    }): UpdateTransactionResult;
    (keyObj: ObjectType, updateObj?: ObjectType, settings?: ModelUpdateSettings): UpdateTransactionResult;
}
export interface ConditionTransaction {
    (key: InputKey, condition: Condition): ConditionTransactionResult;
}
declare type TransactionType = {
    get: GetTransaction;
    create: CreateTransaction;
    delete: DeleteTransaction;
    update: UpdateTransaction;
    condition: ConditionTransaction;
};
interface ModelGetSettings {
    return?: "document" | "request";
    attributes?: string[];
    consistent?: boolean;
}
interface ModelDeleteSettings {
    return?: null | "request";
    condition?: Condition;
}
interface ModelBatchPutSettings {
    return?: "response" | "request";
}
interface ModelUpdateSettings {
    return?: "document" | "request";
    condition?: Condition;
    returnValues?: DynamoDB.ReturnValue;
}
interface ModelBatchGetDocumentsResponse<T> extends DocumentArray<T> {
    unprocessedKeys: ObjectType[];
}
interface ModelBatchGetSettings {
    return?: "documents" | "request";
    attributes?: string[];
}
interface ModelBatchDeleteSettings {
    return?: "response" | "request";
}
export interface ModelIndexes {
    TableIndex?: TableIndex;
    GlobalSecondaryIndexes?: IndexItem[];
    LocalSecondaryIndexes?: IndexItem[];
}
export declare class Model<T extends DocumentCarrier = AnyDocument> {
    constructor(name: string, schema: Schema | SchemaDefinition | (Schema | SchemaDefinition)[], options: ModelOptionsOptional);
    name: string;
    originalName: string;
    options: ModelOptions;
    schemas: Schema[];
    serializer: Serializer;
    private ready;
    alreadyCreated: boolean;
    private pendingTasks;
    latestTableDetails: DynamoDB.DescribeTableOutput;
    pendingTaskPromise: () => Promise<void>;
    static defaults: ModelOptions;
    Document: typeof DocumentCarrier;
    scan: (object?: ConditionInitalizer) => Scan<T>;
    query: (object?: ConditionInitalizer) => Query<T>;
    methods: {
        document: {
            set: (name: string, fn: FunctionType) => void;
            delete: (name: string) => void;
        };
        set: (name: string, fn: FunctionType) => void;
        delete: (name: string) => void;
    };
    transaction: TransactionType;
    schemaForObject(object: ObjectType): Promise<Schema>;
    getIndexes(): Promise<ModelIndexes>;
    getCreateTableAttributeParams(): Promise<Pick<DynamoDB.CreateTableInput, "AttributeDefinitions" | "KeySchema" | "GlobalSecondaryIndexes" | "LocalSecondaryIndexes">>;
    getHashKey(): string;
    getRangeKey(): string | void;
    convertObjectToKey(key: InputKey): KeyObject;
    batchGet(keys: InputKey[]): Promise<ModelBatchGetDocumentsResponse<T>>;
    batchGet(keys: InputKey[], callback: CallbackType<ModelBatchGetDocumentsResponse<T>, AWSError>): void;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings & {
        "return": "request";
    }): DynamoDB.BatchGetItemInput;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings & {
        "return": "request";
    }, callback: CallbackType<DynamoDB.BatchGetItemInput, AWSError>): void;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings): Promise<ModelBatchGetDocumentsResponse<T>>;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings, callback: CallbackType<ModelBatchGetDocumentsResponse<T>, AWSError>): void;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings & {
        "return": "documents";
    }): Promise<ModelBatchGetDocumentsResponse<T>>;
    batchGet(keys: InputKey[], settings: ModelBatchGetSettings & {
        "return": "documents";
    }, callback: CallbackType<ModelBatchGetDocumentsResponse<T>, AWSError>): void;
    batchPut(documents: ObjectType[]): Promise<{
        "unprocessedItems": ObjectType[];
    }>;
    batchPut(documents: ObjectType[], callback: CallbackType<{
        "unprocessedItems": ObjectType[];
    }, AWSError>): void;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings & {
        "return": "request";
    }): Promise<DynamoDB.BatchWriteItemInput>;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings & {
        "return": "request";
    }, callback: CallbackType<DynamoDB.BatchWriteItemInput, AWSError>): void;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings): Promise<{
        "unprocessedItems": ObjectType[];
    }>;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings, callback: CallbackType<{
        "unprocessedItems": ObjectType[];
    }, AWSError>): void;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings & {
        "return": "response";
    }): Promise<{
        "unprocessedItems": ObjectType[];
    }>;
    batchPut(documents: ObjectType[], settings: ModelBatchPutSettings & {
        "return": "response";
    }, callback: CallbackType<{
        "unprocessedItems": ObjectType[];
    }, AWSError>): void;
    batchDelete(keys: InputKey[]): Promise<{
        unprocessedItems: ObjectType[];
    }>;
    batchDelete(keys: InputKey[], callback: CallbackType<{
        unprocessedItems: ObjectType[];
    }, AWSError>): void;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings & {
        "return": "request";
    }): DynamoDB.BatchWriteItemInput;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings & {
        "return": "request";
    }, callback: CallbackType<DynamoDB.BatchWriteItemInput, AWSError>): void;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings): Promise<{
        unprocessedItems: ObjectType[];
    }>;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings, callback: CallbackType<{
        unprocessedItems: ObjectType[];
    }, AWSError>): Promise<{
        unprocessedItems: ObjectType[];
    }>;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings & {
        "return": "response";
    }): Promise<{
        unprocessedItems: ObjectType[];
    }>;
    batchDelete(keys: InputKey[], settings: ModelBatchDeleteSettings & {
        "return": "response";
    }, callback: CallbackType<{
        unprocessedItems: ObjectType[];
    }, AWSError>): Promise<{
        unprocessedItems: ObjectType[];
    }>;
    update(obj: Partial<T>): Promise<T>;
    update(obj: Partial<T>, callback: CallbackType<T, AWSError>): void;
    update(keyObj: InputKey, updateObj: Partial<T>): Promise<T>;
    update(keyObj: InputKey, updateObj: Partial<T>, callback: CallbackType<T, AWSError>): void;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "request";
    }): Promise<DynamoDB.UpdateItemInput>;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "request";
    }, callback: CallbackType<DynamoDB.UpdateItemInput, AWSError>): void;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings): Promise<T>;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings, callback: CallbackType<T, AWSError>): void;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "document";
    }): Promise<T>;
    update(keyObj: InputKey, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "document";
    }, callback: CallbackType<T, AWSError>): void;
    update(keyObj: ObjectType, updateObj: Partial<T>): Promise<T>;
    update(keyObj: ObjectType, updateObj: Partial<T>, callback: CallbackType<T, AWSError>): void;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "request";
    }): Promise<DynamoDB.UpdateItemInput>;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "request";
    }, callback: CallbackType<DynamoDB.UpdateItemInput, AWSError>): void;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings): Promise<T>;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings, callback: CallbackType<T, AWSError>): void;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "document";
    }): Promise<T>;
    update(keyObj: ObjectType, updateObj: Partial<T>, settings: ModelUpdateSettings & {
        "return": "document";
    }, callback: CallbackType<T, AWSError>): void;
    create(document: Partial<T>): Promise<T>;
    create(document: Partial<T>, callback: CallbackType<T, AWSError>): void;
    create(document: Partial<T>, settings: DocumentSaveSettings & {
        return: "request";
    }): Promise<DynamoDB.PutItemInput>;
    create(document: Partial<T>, settings: DocumentSaveSettings & {
        return: "request";
    }, callback: CallbackType<DynamoDB.PutItemInput, AWSError>): void;
    create(document: Partial<T>, settings: DocumentSaveSettings): Promise<T>;
    create(document: Partial<T>, settings: DocumentSaveSettings, callback: CallbackType<T, AWSError>): void;
    create(document: Partial<T>, settings: DocumentSaveSettings & {
        return: "document";
    }): Promise<T>;
    create(document: Partial<T>, settings: DocumentSaveSettings & {
        return: "document";
    }, callback: CallbackType<T, AWSError>): void;
    delete(key: InputKey): Promise<void>;
    delete(key: InputKey, callback: CallbackType<void, AWSError>): void;
    delete(key: InputKey, settings: ModelDeleteSettings & {
        return: "request";
    }): DynamoDB.DeleteItemInput;
    delete(key: InputKey, settings: ModelDeleteSettings & {
        return: "request";
    }, callback: CallbackType<DynamoDB.DeleteItemInput, AWSError>): void;
    delete(key: InputKey, settings: ModelDeleteSettings): Promise<void>;
    delete(key: InputKey, settings: ModelDeleteSettings, callback: CallbackType<void, AWSError>): void;
    delete(key: InputKey, settings: ModelDeleteSettings & {
        return: null;
    }): Promise<void>;
    delete(key: InputKey, settings: ModelDeleteSettings & {
        return: null;
    }, callback: CallbackType<void, AWSError>): void;
    get(key: InputKey): Promise<T>;
    get(key: InputKey, callback: CallbackType<T, AWSError>): void;
    get(key: InputKey, settings: ModelGetSettings & {
        return: "request";
    }): DynamoDB.GetItemInput;
    get(key: InputKey, settings: ModelGetSettings & {
        return: "request";
    }, callback: CallbackType<DynamoDB.GetItemInput, AWSError>): void;
    get(key: InputKey, settings: ModelGetSettings): Promise<T>;
    get(key: InputKey, settings: ModelGetSettings, callback: CallbackType<T, AWSError>): void;
    get(key: InputKey, settings: ModelGetSettings & {
        return: "document";
    }): Promise<T>;
    get(key: InputKey, settings: ModelGetSettings & {
        return: "document";
    }, callback: CallbackType<T, AWSError>): void;
    serializeMany(documentsArray: ModelType<DocumentCarrier>[], nameOrOptions: SerializerOptions | string): any;
}
export {};
