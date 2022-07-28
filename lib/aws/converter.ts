// import * as AWS from 'aws-sdk';

import * as Converter from "@aws-sdk/util-dynamodb";

let customConverter: typeof Converter | undefined;
function main (): typeof Converter {
	return customConverter || Converter;
}
main.set = (converter: typeof Converter): void => {
	customConverter = converter;
};
main.revert = (): void => {
	customConverter = undefined;
};

export = main;
