import {
  DocumentResponse,
  GraphResponse,
  NodeDetailResponse,
  NodeModel,
  EdgeModel,
  TopicModel,
  TopicDetailResponse,
  QueryResponse,
  Citation,
} from '../types/backend';

export const INITIAL_DOCUMENTS: DocumentResponse[] = [];

export const MOCK_NODES: NodeModel[] = [];

export const MOCK_EDGES: EdgeModel[] = [];

export const MOCK_TOPICS: TopicModel[] = [];

export const INITIAL_CHAT_MESSAGES: Array<{
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  response?: QueryResponse;
}> = [];
