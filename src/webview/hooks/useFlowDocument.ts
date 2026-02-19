import { useEffect, useState } from "react";
import { produce } from "immer";
import { flowService } from "../services/FlowService";
import { FlowDocument, FlowContext } from "../../types/MessageProtocol";

export const useFlowDocument = () => {
  const [document, setDocument] = useState<FlowDocument>({});
  const [context, setContext] = useState<FlowContext>({
    cwd: "",
    branch: null,
    shell: null,
    connection: "local",
  });

  useEffect(() => {
    // Subscribe to messages
    const unsubscribe = flowService.subscribe((message: any) => {
      // Handle messages from extension
      if (message.type === "init") {
        setDocument(message.document);
        setContext(message.context);
      } else if (message.type === "update") {
        setDocument(message.document);
        if (message.context) {
          setContext(message.context);
        }
      }
    });

    // Initialize the service to get initial state
    flowService.init();

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Update the document using immer producer
   * This updates local state and sends update to extension
   */
  const updateDocument = (producer: (draft: FlowDocument) => void) => {
    // Produce next state using immer
    const nextState = produce(document, producer);

    // Update local state and backend
    setDocument(nextState);
    flowService.update(nextState);
  };

  return {
    document,
    context,
    updateDocument,
  };
};
