import object = require("js-object-utilities");
import find_best_index from "./find_best_index";
import deep_copy from "./deep_copy";
declare const _default: {
    combine_objects: <T>(...args: T[]) => T;
    merge_objects: any;
    timeout: (time: string | number) => Promise<void>;
    capitalize_first_letter: (str: string) => string;
    set_immediate_promise: () => Promise<void>;
    unique_array_elements: <T_1>(array: T_1[]) => T_1[];
    all_elements_match: <T_2>(array: T_2[]) => boolean;
    array_flatten: <T_3>(array: T_3[]) => any[];
    empty_function: () => void;
    object: typeof object;
    dynamoose: {
        get_provisioned_throughput: (options: Partial<import("./dynamoose/get_provisioned_throughput").ModelSettings>) => {} | {
            BillingMode: "PAY_PER_REQUEST";
        } | {
            ProvisionedThroughput: {
                ReadCapacityUnits: number;
                WriteCapacityUnits: number;
            };
        };
        wildcard_allowed_check: (saveUnknown: boolean | string[], checkKey: string, settings?: {
            splitString: string;
            prefixesDisallowed: boolean;
        }) => boolean;
        index_changes: (model: import("../Model").Model<import("../Document").Document>, existingIndexes?: any[]) => Promise<(import("./dynamoose/index_changes").ModelIndexAddChange | import("./dynamoose/index_changes").ModelIndexDeleteChange)[]>;
        convertConditionArrayRequestObjectToString: (expression: any[]) => string;
        getValueTypeCheckResult: (schema: import("../Schema").Schema, value: any, key: string, settings: {
            type: "toDynamo" | "fromDynamo";
        }, options: {
            standardKey?: boolean;
            typeIndexOptionMap?: import("../General").ObjectType;
        }) => {
            typeDetails: import("../Schema").DynamoDBSetTypeResult | import("../Schema").DynamoDBTypeResult | import("../Schema").DynamoDBTypeResult[] | import("../Schema").DynamoDBSetTypeResult[];
            matchedTypeDetailsIndex: number;
            matchedTypeDetailsIndexes: number[];
            matchedTypeDetails: import("../Schema").DynamoDBSetTypeResult | import("../Schema").DynamoDBTypeResult;
            typeDetailsArray: (import("../Schema").DynamoDBSetTypeResult | import("../Schema").DynamoDBTypeResult)[];
            isValidType: boolean;
        };
        documentToJSON: typeof import("./dynamoose/documentToJSON").documentToJSON;
    };
    type_name: (value: any, typeDetailsArray: (import("../Schema").DynamoDBSetTypeResult | import("../Schema").DynamoDBTypeResult)[]) => string;
    find_best_index: typeof find_best_index;
    deep_copy: typeof deep_copy;
};
export = _default;
