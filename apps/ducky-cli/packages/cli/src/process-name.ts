export const CLI_COMMAND_NAME = "ducky";
export const CLI_PROCESS_NAME = "ducky-cli";

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};
