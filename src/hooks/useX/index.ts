import { useXAgent, useXChat, XStream } from '@ant-design/x'
import {
	DifyApi,
	EventEnum,
	IAgentThought,
	IChunkChatCompletionResponse,
	IErrorEvent,
	IFile,
	IGetAppParametersResponse,
} from '@dify-chat/api'
import { IWorkflowNode } from '@dify-chat/api'
import { useDifyChat } from '@dify-chat/core'
import { isTempId } from '@dify-chat/helpers'
import { message as antdMessage, FormInstance } from 'antd'
import { useState } from 'react'

import { RESPONSE_MODE } from '@/config'
import { IAgentMessage, IMessageFileItem } from '@/types'

import workflowDataStorage from './workflow-data-storage'

export const useX = (options: {
	difyApi: DifyApi
	latestProps: React.MutableRefObject<{
		conversationId: string | undefined
		appId?: string
	}>
	entryForm: FormInstance<Record<string, unknown>>
	latestState: React.MutableRefObject<{
		inputParams: Record<string, unknown>
	}>
	getNextSuggestions: (messageId: string) => void
	appParameters?: IGetAppParametersResponse
	filesRef: React.MutableRefObject<IFile[]>
	abortRef: React.MutableRefObject<() => void>
	getConversationMessages: (conversationId: string) => void
	onConversationIdChange: (id: string) => void
}) => {
	const {
		latestProps,
		appParameters,
		getNextSuggestions,
		filesRef,
		abortRef,
		getConversationMessages,
		onConversationIdChange,
		entryForm,
		difyApi,
	} = options
	const { user } = useDifyChat()
	const [currentTaskId, setCurrentTaskId] = useState('')

	const [agent] = useXAgent<IAgentMessage>({
		request: async ({ message }, { onSuccess, onUpdate, onError }) => {
			// 发送消息
			const response = await difyApi.sendMessage({
				inputs: message?.inputs || entryForm.getFieldsValue() || {},
				conversation_id: !isTempId(latestProps.current.conversationId)
					? latestProps.current.conversationId
					: undefined,
				files: filesRef.current || [],
				user,
				response_mode: RESPONSE_MODE,
				query: message?.content as string,
			})

			let result = ''
			const files: IMessageFileItem[] = []
			const workflows: IAgentMessage['workflows'] = {}
			const agentThoughts: IAgentThought[] = []

			// 异常 => 结束
			if (response.status !== 200) {
				const errText = response.statusText || '请求对话接口失败'
				antdMessage.error(errText)
				// 打断输出
				abortRef.current = () => {
					// onError 是为了结束 agent 的 isRequesting 以更新 Sender 的发送按钮状态
					onError({
						name: response.status.toString(),
						message: errText,
					})
				}
				abortRef.current()
				return
			}

			const readableStream = XStream({
				readableStream: response.body as NonNullable<ReadableStream>,
			})

			const reader = readableStream.getReader()
			abortRef.current = () => {
				reader?.cancel()
				onError({
					name: 'abort',
					message: '用户已取消',
				})
			}

			// 记录对话和消息 ID
			let conversationId = latestProps.current.conversationId || ''
			let messageId = ''
			while (reader) {
				const { value: chunk, done } = await reader.read()
				if (done) {
					// 缓存工作流数据
					workflowDataStorage.set({
						appId: latestProps.current.appId || '',
						conversationId,
						messageId,
						key: 'workflows',
						value: workflows,
					})
					onSuccess({
						content: result,
						files,
						workflows,
						agentThoughts,
					})
					getConversationMessages(conversationId)
					onConversationIdChange(conversationId)
					break
				}
				if (!chunk) continue
				if (chunk.data) {
					let parsedData = {} as {
						id: string
						task_id: string
						position: number
						tool: string
						tool_input: string
						observation: string
						message_files: string[]

						event: IChunkChatCompletionResponse['event']
						answer: string
						conversation_id: string
						message_id: string

						// 类型
						type: 'image'
						// 图片链接
						url: string

						data: {
							// 工作流节点的数据
							id: string
							node_type: IWorkflowNode['type']
							title: string
							inputs: string
							outputs: string
							process_data: string
							elapsed_time: number
							execution_metadata: IWorkflowNode['execution_metadata']
						}
					}
					try {
						parsedData = JSON.parse(chunk.data)
					} catch (error) {
						console.error('解析 JSON 失败', error)
					}
					if (parsedData.task_id && parsedData.task_id !== currentTaskId) {
						setCurrentTaskId(parsedData.task_id)
					}
					if (parsedData.event === EventEnum.MESSAGE_END) {
						// onSuccess({
						// 	content: result,
						// 	files,
						// 	workflows,
						// 	agentThoughts,
						// })
						// 刷新消息列表
						// getConversationMessages(parsedData.conversation_id)
						// onConversationIdChange(parsedData.conversation_id)
						// const conversation_id = parsedData.conversation_id;
						// 如果有对话 ID，跟当前的对比一下
						// if (conversation_id && isTempId(conversationId)) {
						//   // 通知外部组件，对话 ID 变更，外部组件需要更新对话列表
						//   onConversationIdChange(conversation_id);
						// }
						// 如果开启了建议问题，获取下一轮问题建议
						if (appParameters?.suggested_questions_after_answer.enabled) {
							getNextSuggestions(parsedData.message_id)
						}
					}
					const innerData = parsedData.data
					if (parsedData.event === EventEnum.WORKFLOW_STARTED) {
						// 在这里才赋值 conversationId 和 messageId，因为其他事件中可能没有这些字段
						conversationId = parsedData.conversation_id
						messageId = parsedData.message_id
						workflows.status = 'running'
						workflows.nodes = []
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					} else if (parsedData.event === EventEnum.WORKFLOW_FINISHED) {
						console.log('工作流结束', parsedData)
						workflows.status = 'finished'
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					} else if (parsedData.event === EventEnum.WORKFLOW_NODE_STARTED) {
						console.log('节点开始', parsedData)
						workflows.nodes = [
							...(workflows.nodes || []),
							{
								id: innerData.id,
								status: 'running',
								type: innerData.node_type,
								title: innerData.title,
							} as IWorkflowNode,
						]
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					} else if (parsedData.event === EventEnum.WORKFLOW_NODE_FINISHED) {
						workflows.nodes = workflows.nodes?.map(item => {
							if (item.id === innerData.id) {
								return {
									...item,
									status: 'success',
									inputs: innerData.inputs,
									outputs: innerData.outputs,
									process_data: innerData.process_data,
									elapsed_time: innerData.elapsed_time,
									execution_metadata: innerData.execution_metadata,
								}
							}
							return item
						})
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					}
					if (parsedData.event === EventEnum.MESSAGE_FILE) {
						result += `<img src=""${parsedData.url} />`
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					}
					if (parsedData.event === EventEnum.MESSAGE) {
						const text = parsedData.answer
						result += text
						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					}
					if (parsedData.event === EventEnum.ERROR) {
						onError({
							name: `${(parsedData as unknown as IErrorEvent).status}: ${(parsedData as unknown as IErrorEvent).code}`,
							message: (parsedData as unknown as IErrorEvent).message,
						})
						getConversationMessages(parsedData.conversation_id)
					}
					if (parsedData.event === EventEnum.AGENT_MESSAGE) {
						const lastAgentThought = agentThoughts[agentThoughts.length - 1]

						if (lastAgentThought) {
							// 将agent_message以流式形式输出到最后一条agent_thought里
							const text = parsedData.answer
							lastAgentThought.thought += text
						} else {
							continue
						}

						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					}
					if (parsedData.event === EventEnum.AGENT_THOUGHT) {
						const existAgentThoughtIndex = agentThoughts.findIndex(
							_agentThought => _agentThought.position === parsedData.position,
						)

						const newAgentThought = {
							conversation_id: parsedData.conversation_id,
							id: parsedData.id as string,
							task_id: parsedData.task_id,
							position: parsedData.position,
							tool: parsedData.tool,
							tool_input: parsedData.tool_input,
							observation: parsedData.observation,
							message_files: parsedData.message_files,
							message_id: parsedData.message_id,
						} as IAgentThought

						if (existAgentThoughtIndex !== -1) {
							// 如果已存在一条，则替换内容
							agentThoughts[existAgentThoughtIndex] = newAgentThought
						} else {
							// 如果不存在，则插入一条
							agentThoughts.push(newAgentThought)
						}

						onUpdate({
							content: result,
							files,
							workflows,
							agentThoughts,
						})
					}
				} else {
					console.log('没有数据', chunk)
					continue
				}
			}
		},
	})

	const { onRequest, messages, setMessages } = useXChat({
		agent,
	})

	return { agent, onRequest, messages, setMessages, currentTaskId }
}
