import {
  Attachments,
  Bubble,
  Conversations,
  Prompts,
  Sender,
  Welcome,
  useXAgent,
  useXChat,
  XProvider,
  XStream,
  BubbleProps,
} from '@ant-design/x';
import { createStyles } from 'antd-style';
import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

import {
  CloudUploadOutlined,
  CommentOutlined,
  EllipsisOutlined,
  FireOutlined,
  HeartOutlined,
  LinkOutlined,
  MessageOutlined,
  PlusOutlined,
  ReadOutlined,
  ShareAltOutlined,
  SmileOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Form, FormItemProps, type GetProp, Input, Select, Space, Typography } from 'antd';
import markdownit from 'markdown-it';
import { getAppParameters, getConversationHistory, getConversationList, sendMessage } from './utils/dify-api';
import { RESPONSE_MODE, USER } from './config';
import { MessageInfo } from '@ant-design/x/es/useXChat';

const md = markdownit({ html: true, breaks: true });

const renderTitle = (icon: React.ReactElement, title: string) => (
  <Space align="start">
    {icon}
    <span>{title}</span>
  </Space>
);

const useStyle = createStyles(({ token, css }) => {
  return {
    layout: css`
      width: 100%;
      min-width: 1000px;
      height: 100vh;
      border-radius: ${token.borderRadius}px;
      display: flex;
      background: ${token.colorBgContainer};
      font-family: AlibabaPuHuiTi, ${token.fontFamily}, sans-serif;

      .ant-prompts {
        color: ${token.colorText};
      }
    `,
    menu: css`
      background: ${token.colorBgLayout}80;
      width: 280px;
      height: 100%;
      display: flex;
      flex-direction: column;
    `,
    conversations: css`
      padding: 0 12px;
      flex: 1;
      overflow-y: auto;
    `,
    chat: css`
      height: 100%;
      width: 100%;
      // max-width: 700px;
      margin: 0 auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      padding: ${token.paddingLG}px;
      gap: 16px;
    `,
    messages: css`
      flex: 1;
    `,
    placeholder: css`
      flex: 1;
      padding-top: 32px;
    `,
    sender: css`
      box-shadow: ${token.boxShadow};
    `,
    logo: css`
      display: flex;
      height: 72px;
      align-items: center;
      justify-content: start;
      padding: 0 24px;
      box-sizing: border-box;

      img {
        width: 24px;
        height: 24px;
        display: inline-block;
      }

      span {
        display: inline-block;
        margin: 0 8px;
        font-weight: bold;
        color: ${token.colorText};
        font-size: 16px;
      }
    `,
    addBtn: css`
      background: #1677ff0f;
      border: 1px solid #1677ff34;
      width: calc(100% - 24px);
      margin: 0 12px 24px 12px;
    `,
  };
});

const placeholderPromptsItems: GetProp<typeof Prompts, 'items'> = [
  {
    key: '1',
    label: renderTitle(
      <FireOutlined style={{ color: '#FF4D4F' }} />,
      'Hot Topics',
    ),
    description: 'What are you interested in?',
    children: [
      {
        key: '1-1',
        description: `What's new in X?`,
      },
      {
        key: '1-2',
        description: `What's AGI?`,
      },
      {
        key: '1-3',
        description: `Where is the doc?`,
      },
    ],
  },
  {
    key: '2',
    label: renderTitle(
      <ReadOutlined style={{ color: '#1890FF' }} />,
      'Design Guide',
    ),
    description: 'How to design a good product?',
    children: [
      {
        key: '2-1',
        icon: <HeartOutlined />,
        description: `Know the well`,
      },
      {
        key: '2-2',
        icon: <SmileOutlined />,
        description: `Set the AI role`,
      },
      {
        key: '2-3',
        icon: <CommentOutlined />,
        description: `Express the feeling`,
      },
    ],
  },
];

const senderPromptsItems: GetProp<typeof Prompts, 'items'> = [
  {
    key: '1',
    description: 'Hot Topics',
    icon: <FireOutlined style={{ color: '#FF4D4F' }} />,
  },
  {
    key: '2',
    description: 'Design Guide',
    icon: <ReadOutlined style={{ color: '#1890FF' }} />,
  },
];

interface IConversationItem { key: string; label: string; }

interface IConversationEntryFormItem extends FormItemProps {
  type: 'input' | 'select'
}

const isTempId = (id: string | undefined) => {
  return id?.startsWith('temp')
}

const roles: GetProp<typeof Bubble.List, 'roles'> = {
  ai: {
    placement: 'start',
    avatar: { icon: <UserOutlined />, style: { background: '#fde3cf' } },
    // typing: { step: 5, interval: 20 },
    style: {
      maxWidth: '70%',
    },
  },
  user: {
    placement: 'end',
    avatar: { icon: <UserOutlined />, style: { background: '#87d068' } },
  },
};

const XUI: React.FC = () => {
  const [entryForm] = Form.useForm()
  const { styles } = useStyle();
  const [content, setContent] = useState('');
  const [conversationsItems, setConversationsItems] = useState<IConversationItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>();
  const [curentConversationId, setCurentConversationId] = useState<string>();
  const [userInputItems, setUserInputItems] = useState<IConversationEntryFormItem[]>([])
  const [chatInitialized, setChatInitialized] = useState<boolean>(false)
  const [target, setTarget] = useState('')
  const [historyMessages, setHistoryMessages] = useState<MessageInfo<string>[]>([])

  const getConversationItems = async () => {
    const result = await getConversationList()
    const newItems = result?.data?.map((item) => {
      return {
        key: item.id,
        label: item.name,
      }
    }) || []
    setConversationsItems(newItems)
  }

  useEffect(() => {
    getConversationItems()
  }, [])

  const [agent] = useXAgent({
    request: async ({ message }, { onSuccess }) => {

      console.log('进来了吗', message)

      // 发送消息
      const response = await sendMessage({
        inputs: {
          target,
        },
        conversation_id: !isTempId(curentConversationId) ? curentConversationId : undefined,
        files: [],
        user: USER,
        response_mode: RESPONSE_MODE,
        query: message
      })

      let result = ''

      for await (const chunk of XStream({
        readableStream: response.body,
      })) {
        console.log('new chunk', chunk)
        if (chunk.data) {
          console.log('chunk.data', chunk.data)
          let parsedData = {}
          try {
            parsedData = JSON.parse(chunk.data)
          } catch (error) {
            console.error('解析 JSON 失败', error)
          }
          if (!parsedData.answer) {
            console.log('没有数据', chunk)
          } else {
            const text = parsedData.answer
            const conversation_id = parsedData.conversation_id

            // 如果有对话 ID，跟当前的对比一下
            if (conversation_id) {
              // 如果当前对话 ID 是临时 ID, 则更新到当前对话 ID
              if (isTempId(curentConversationId)) {
                setCurentConversationId(conversation_id)
              }
            }
            console.log('text', text)
            // onUpdate(text);
            result += text
          }
        } else {
          console.log('没有数据', chunk)
        }
      }
      onSuccess(result);
    },
  });

  const { onRequest, messages, setMessages } = useXChat({
    agent,
  });

  useEffect(() => {
    if (activeKey !== undefined) {
      setMessages([]);
    }
  }, [activeKey]);

  const onSubmit = (nextContent: string) => {
    console.log('enter onSubmit', nextContent)
    if (!nextContent) return;
    console.log('onSubmit', nextContent)
    onRequest(nextContent);
    setContent('');
  };

  const onChange = (nextContent: string) => {
    setContent(nextContent);
  };

  const onPromptsItemClick: GetProp<typeof Prompts, 'onItemClick'> = (info) => {
    onRequest(info.data.description as string);
  };

  const onAddConversation = () => {

    // 创建新对话

    setConversationsItems([
      ...conversationsItems,
      {
        key: `temp_${Math.random()}`,
        label: `新对话`,
      },
    ]);
    setActiveKey(`${conversationsItems.length}`);
  };

  const handleAddConversationBtnClick = async () => {

    // 先获取应用信息
    const result = await getAppParameters()
    setChatInitialized(false)

    console.log('result', result.user_input_form)
    // 将参数转换为 Ant Design Form
    if (result.user_input_form?.length) {
      // 有参数则展示表单
      const formItems = result.user_input_form?.map((item) => {
        if (item['text-input']) {
          const originalProps = item['text-input']
          const baseProps: IConversationEntryFormItem = {
            type: 'input',
            label: originalProps.label,
            name: originalProps.variable,
          }
          if (originalProps.required) {
            baseProps.required = true
            baseProps.rules = [{ required: true, message: '请输入' }]
          }
          return baseProps
        }
        return {} as IConversationEntryFormItem
      }) || []
      setUserInputItems(formItems)
    } else {
      setChatInitialized(true)
    }

    console.log('应用信息', result)

    onAddConversation()
  };

  console.log('表单信息', userInputItems)

  const getConversationMessages = async (conversationId: string) => {
    const result = await getConversationHistory(conversationId)
    console.log('对话历史', result)

    const newMessages: MessageInfo<string>[] = []

    if (result.data.length) {
      setTarget(result.data[0]?.inputs?.target)
    }

    result.data.forEach((item) => {
      newMessages.push({
        id: `${item.id}-query`,
        message: item.query,
        status: 'success',
        isHistory: true,
      }, {
        id: `${item.id}-answer`,
        message: item.answer,
        status: 'success',
        isHistory: true,
      })
    })

    setHistoryMessages(newMessages)
  }

  const onConversationClick: GetProp<typeof Conversations, 'onActiveChange'> = (
    key,
  ) => {
    setHistoryMessages([])
    setActiveKey(key);
    setCurentConversationId(key)
    getConversationMessages(key)
  };

  const renderMarkdown: BubbleProps['messageRender'] = (content) => (
    <Typography>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: used in demo */}
      <div dangerouslySetInnerHTML={{ __html: md.render(content) }} />
    </Typography>
  );

  // ==================== Nodes ====================

  const items: GetProp<typeof Bubble.List, 'items'> = useMemo(() => {
    return [...historyMessages, ...messages].map(
      (messageItem) => {
        const { id, message, status, isHistory } = messageItem;
        const isQuery = id.toString().endsWith('query')
        return {
          key: id,
          loading: status === 'loading',
          content: message,
          messageRender: renderMarkdown,
          // 用户发送消息时，status 为 local，需要展示为用户头像
          role: isQuery || status === 'local' ? 'user' : 'ai',
          typing: isHistory? undefined : {
            step: 5,
            interval: 20,
          },
        }
      },
    )
  }, [historyMessages, messages]);

  const placeholderNode = (
    <Space direction="vertical" size={16} className={styles.placeholder}>
      <Welcome
        variant="borderless"
        icon="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*s5sNRo5LjfQAAAAAAAAAAAAADgCCAQ/fmt.webp"
        title="Hello, I'm Ant Design X"
        description="Base on Ant Design, AGI product interface solution, create a better intelligent vision~"
        extra={
          <Space>
            <Button icon={<ShareAltOutlined />} />
            <Button icon={<EllipsisOutlined />} />
          </Space>
        }
      />
      <Prompts
        title="Do you want?"
        items={placeholderPromptsItems}
        styles={{
          list: {
            width: '100%',
          },
          item: {
            flex: 1,
          },
        }}
        onItemClick={onPromptsItemClick}
      />
    </Space>
  );

  const attachmentsNode = (
    <Attachments
      beforeUpload={() => false}
      placeholder={{
        icon: <CloudUploadOutlined />,
        title: 'Drag & Drop files here',
        description: 'Support file type: image, video, audio, document, etc.',
      }}
    >
      <Button type="text" icon={<LinkOutlined />} />
    </Attachments>
  );

  const logoNode = (
    <div className={styles.logo}>
      <img
        src="https://mdn.alipayobjects.com/huamei_iwk9zp/afts/img/A*eco6RrQhxbMAAAAAAAAAAAAADgCCAQ/original"
        draggable={false}
        alt="logo"
      />
      <span>Ant Design X</span>
    </div>
  );

  // ==================== Render =================
  return (
    <XProvider theme={{ token: { colorPrimary: '#ff4a4a' } }}>
      <div className={styles.layout}>
        <div className={styles.menu}>
          {/* 🌟 Logo */}
          {logoNode}
          {/* 🌟 添加会话 */}
          <Button
            onClick={handleAddConversationBtnClick}
            type="link"
            className={styles.addBtn}
            icon={<PlusOutlined />}
          >
            New Conversation
          </Button>
          {/* 🌟 会话管理 */}
          <Conversations
            items={conversationsItems}
            className={styles.conversations}
            activeKey={activeKey}
            onActiveChange={onConversationClick}
          />
        </div>
        {
          !chatInitialized && userInputItems?.length ?
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              // flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '-20px'
            }}>
              <div style={{
                width: '400px'
              }}>
                <div style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#000',
                  marginBottom: '20px',
                  // textAlign: 'center'
                }}>
                  Dify Chat
                </div>
                <Form form={entryForm}>
                  {
                    userInputItems.map((item) => {
                      return (
                        <Form.Item key={item.name} name={item.name} label={item.label} required={item.required} rules={item.rules}>
                          {
                            item.type === 'input'
                              ?
                              <Input placeholder='请输入' />
                              : item.type === 'select'
                                ?
                                <Select placeholder='请选择' />
                                : '不支持的控件类型'
                          }
                        </Form.Item>
                      )
                    })
                  }
                </Form>
                <Button block type='primary' icon={<MessageOutlined />}
                  onClick={async () => {
                    const result = await entryForm.validateFields()
                    const values = entryForm.getFieldsValue()
                    console.log('表单值', values)
                    console.log('result', result)
                    setTarget(entryForm.getFieldValue('target'))
                    setChatInitialized(true)
                  }}
                >开始对话</Button>
              </div>
            </div>
            :
            <div className={styles.chat}>
              {/* 🌟 欢迎占位 */}
              {!items.length && placeholderNode}
              {/* 🌟 消息列表 */}
              <Bubble.List
                items={items}
                roles={roles}
                className={styles.messages}
              />
              {/* 🌟 提示词 */}
              <Prompts
                items={senderPromptsItems}
                onItemClick={onPromptsItemClick}
              />
              {/* 🌟 输入框 */}
              <Sender
                value={content}
                onChange={onChange}
                onSubmit={onSubmit}
                prefix={attachmentsNode}
                loading={agent.isRequesting()}
                className={styles.sender}
              />
            </div>
        }
      </div>
    </XProvider>
  );
};

export default XUI;
