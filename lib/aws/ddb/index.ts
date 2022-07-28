import {DynamoDBClient} from "../sdk";

let customDDB: DynamoDBClient | undefined;
function main (): DynamoDBClient {
	return customDDB || new DynamoDBClient({
		"region": process.env.AWS_REGION as string
	});
}
main.set = (ddb: DynamoDBClient): void => {
	customDDB = ddb;
};
main.revert = (): void => {
	customDDB = undefined;
};
main.local = (endpoint = "http://localhost:8000"): void => {
	main.set(new DynamoDBClient({
		endpoint
	}));
};

export = main;
