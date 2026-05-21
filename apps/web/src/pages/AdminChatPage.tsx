import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Plus, RefreshCcw, Save, TestTube2 } from 'lucide-react';
import {
  createAdminChatModel,
  disableAdminChatModel,
  getAdminChatSettings,
  listAdminChatModels,
  testAdminChatModel,
  updateAdminChatModel,
  updateAdminChatSettings,
  type ChatModel,
  type ChatModelStatus,
  type ChatSettings
} from '../api';

const emptyModelForm = {
  id: 0,
  name: '',
  modelKey: '',
  baseUrl: '',
  apiKey: '',
  status: 'active' as ChatModelStatus,
  isDefault: false,
  sortOrder: 0,
  description: ''
};

type ModelForm = typeof emptyModelForm;

export function AdminChatPage() {
  const [settings, setSettings] = useState<Required<ChatSettings> | null>(null);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [settingsPayload, modelsPayload] = await Promise.all([
        getAdminChatSettings(),
        listAdminChatModels()
      ]);
      setSettings(settingsPayload.settings);
      setModels(modelsPayload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 AI 对话管理数据失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError('');
    setMessage('');
    setIsSavingSettings(true);
    try {
      const payload = await updateAdminChatSettings(settings);
      setSettings(payload.settings);
      setMessage('AI 对话设置已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存设置失败');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function saveModel(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!modelForm.name.trim() || !modelForm.modelKey.trim() || !modelForm.baseUrl.trim()) {
      setError('请填写模型名称、模型标识和 Base URL。');
      return;
    }

    setIsSavingModel(true);
    try {
      if (modelForm.id) {
        await updateAdminChatModel(modelForm.id, modelPayload(modelForm, false));
        setMessage('模型已更新。');
      } else {
        await createAdminChatModel(modelPayload(modelForm, true));
        setMessage('模型已创建。');
      }
      setModelForm(emptyModelForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模型失败');
    } finally {
      setIsSavingModel(false);
    }
  }

  function editModel(item: ChatModel) {
    setModelForm({
      id: item.id,
      name: item.name,
      modelKey: item.modelKey,
      baseUrl: item.baseUrl || '',
      apiKey: '',
      status: item.status,
      isDefault: item.isDefault,
      sortOrder: item.sortOrder,
      description: item.description || ''
    });
  }

  async function toggleModel(item: ChatModel) {
    setError('');
    setMessage('');
    try {
      if (item.status === 'active') {
        await disableAdminChatModel(item.id);
      } else {
        await updateAdminChatModel(item.id, { status: 'active' });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新模型状态失败');
    }
  }

  async function setDefaultModel(item: ChatModel) {
    setError('');
    setMessage('');
    try {
      await updateAdminChatModel(item.id, { isDefault: true, status: 'active' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置默认模型失败');
    }
  }

  async function testModel(item: ChatModel) {
    setError('');
    setMessage('');
    setTestingId(item.id);
    try {
      await testAdminChatModel(item.id);
      setMessage(`${item.name} 测试通过。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '模型测试失败');
    } finally {
      setTestingId(null);
    }
  }

  if (!settings) {
    return <div className="page"><div className="panel emptyState">{isLoading ? '加载 AI 对话管理...' : '暂无配置'}</div></div>;
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <h1>AI 对话管理</h1>
        </div>
        <button className="ghostButton" type="button" disabled={isLoading} onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {message && <div className="hintBox">{message}</div>}

      <div className="adminChatGrid">
        <form className="panel formPanel" onSubmit={saveSettings}>
          <div className="panelTitle"><h2>对话设置</h2></div>
          <label className="toggleRow">
            <span>启用 AI 对话</span>
            <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>每条消息积分</span>
              <input type="number" min={0} max={100000} value={settings.messageCreditCost} onChange={(event) => setSettings({ ...settings, messageCreditCost: Number(event.target.value) })} />
            </label>
            <label className="field">
              <span>最大输入字符</span>
              <input type="number" min={1} max={50000} value={settings.maxInputChars} onChange={(event) => setSettings({ ...settings, maxInputChars: Number(event.target.value) })} />
            </label>
          </div>
          <div className="formRow two">
            <label className="field">
              <span>携带历史消息数</span>
              <input type="number" min={1} max={100} value={settings.maxHistoryMessages} onChange={(event) => setSettings({ ...settings, maxHistoryMessages: Number(event.target.value) })} />
            </label>
            <label className="field">
              <span>请求超时毫秒</span>
              <input type="number" min={1000} max={600000} value={settings.requestTimeoutMs} onChange={(event) => setSettings({ ...settings, requestTimeoutMs: Number(event.target.value) })} />
            </label>
          </div>
          <label className="field">
            <span>系统提示词</span>
            <textarea value={settings.systemPrompt} onChange={(event) => setSettings({ ...settings, systemPrompt: event.target.value })} />
          </label>
          <button className="primaryButton compact" type="submit" disabled={isSavingSettings}>
            <Save size={16} />
            {isSavingSettings ? '保存中' : '保存设置'}
          </button>
        </form>

        <form className="panel formPanel" onSubmit={saveModel}>
          <div className="panelTitle"><h2>{modelForm.id ? '编辑模型' : '新建模型'}</h2></div>
          <label className="field">
            <span>模型名称</span>
            <input value={modelForm.name} onChange={(event) => setModelForm({ ...modelForm, name: event.target.value })} />
          </label>
          <div className="formRow two">
            <label className="field">
              <span>模型标识</span>
              <input value={modelForm.modelKey} onChange={(event) => setModelForm({ ...modelForm, modelKey: event.target.value })} />
            </label>
            <label className="field">
              <span>排序</span>
              <input type="number" value={modelForm.sortOrder} onChange={(event) => setModelForm({ ...modelForm, sortOrder: Number(event.target.value) })} />
            </label>
          </div>
          <label className="field">
            <span>Base URL</span>
            <input value={modelForm.baseUrl} onChange={(event) => setModelForm({ ...modelForm, baseUrl: event.target.value })} />
          </label>
          <label className="field">
            <span>API Key</span>
            <input type="password" placeholder={modelForm.id ? '留空表示不修改' : ''} value={modelForm.apiKey} onChange={(event) => setModelForm({ ...modelForm, apiKey: event.target.value })} />
          </label>
          <label className="field">
            <span>说明</span>
            <input value={modelForm.description} onChange={(event) => setModelForm({ ...modelForm, description: event.target.value })} />
          </label>
          <label className="toggleRow">
            <span>启用</span>
            <input type="checkbox" checked={modelForm.status === 'active'} onChange={(event) => setModelForm({ ...modelForm, status: event.target.checked ? 'active' : 'disabled' })} />
          </label>
          <label className="toggleRow">
            <span>设为默认模型</span>
            <input type="checkbox" checked={modelForm.isDefault} onChange={(event) => setModelForm({ ...modelForm, isDefault: event.target.checked })} />
          </label>
          <div className="modalActions">
            {modelForm.id ? <button className="ghostButton" type="button" onClick={() => setModelForm(emptyModelForm)}>取消编辑</button> : null}
            <button className="primaryButton compact" type="submit" disabled={isSavingModel}>
              <Plus size={16} />
              {isSavingModel ? '保存中' : modelForm.id ? '保存模型' : '创建模型'}
            </button>
          </div>
        </form>
      </div>

      <section className="panel tablePanel">
        <div className="tableHeader">
          <h2>模型列表</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>模型</th>
              <th>状态</th>
              <th>默认</th>
              <th>密钥</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {models.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <span>{item.modelKey}</span>
                  {item.description && <span>{item.description}</span>}
                </td>
                <td>{item.status === 'active' ? '启用' : '停用'}</td>
                <td>{item.isDefault ? <CheckCircle2 size={16} /> : '-'}</td>
                <td>{item.hasApiKey ? '已配置' : '未配置'}</td>
                <td>{item.sortOrder}</td>
                <td>
                  <div className="tableActions">
                    <button className="ghostButton" type="button" onClick={() => editModel(item)}>编辑</button>
                    <button className="ghostButton" type="button" disabled={item.isDefault} onClick={() => void setDefaultModel(item)}>设默认</button>
                    <button className="ghostButton" type="button" onClick={() => void toggleModel(item)}>{item.status === 'active' ? '停用' : '启用'}</button>
                    <button className="ghostButton" type="button" disabled={testingId === item.id || item.status !== 'active'} onClick={() => void testModel(item)}>
                      {testingId === item.id ? <Loader2 className="spin" size={14} /> : <TestTube2 size={14} />}
                      测试
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr>
                <td colSpan={6}>暂无模型，请先创建一个启用模型。</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function modelPayload(form: ModelForm, includeEmptyKey: boolean) {
  return {
    name: form.name.trim(),
    modelKey: form.modelKey.trim(),
    baseUrl: form.baseUrl.trim(),
    ...(form.apiKey.trim() || includeEmptyKey ? { apiKey: form.apiKey.trim() } : {}),
    status: form.status,
    isDefault: form.isDefault,
    sortOrder: form.sortOrder,
    description: form.description.trim()
  };
}
