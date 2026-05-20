import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, RefreshCcw, Ticket, XCircle } from 'lucide-react';
import {
  createRedeemBatch,
  createRedeemPackage,
  disableRedeemCode,
  listRedeemBatches,
  listRedeemCodesForBatch,
  listRedeemPackages,
  updateRedeemPackage,
  type RedeemCode,
  type RedeemCodeBatch,
  type RedeemPackage
} from '../api';

const emptyPackageForm = {
  name: '',
  credits: 10,
  description: ''
};

const emptyBatchForm = {
  packageId: 0,
  quantity: 10,
  expiresAt: '',
  note: ''
};

export function AdminRedeemCodesPage() {
  const [packages, setPackages] = useState<RedeemPackage[]>([]);
  const [batches, setBatches] = useState<RedeemCodeBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [codes, setCodes] = useState<RedeemCode[]>([]);
  const [packageForm, setPackageForm] = useState(emptyPackageForm);
  const [batchForm, setBatchForm] = useState(emptyBatchForm);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);

  const activePackages = useMemo(() => packages.filter((item) => item.status === 'active'), [packages]);
  const selectedBatch = batches.find((item) => item.id === selectedBatchId) || null;

  const load = useCallback(async (options: { setDefaultPackage?: boolean } = {}) => {
    setIsLoading(true);
    setError('');
    try {
      const [packagesPayload, batchesPayload] = await Promise.all([
        listRedeemPackages(),
        listRedeemBatches()
      ]);
      setPackages(packagesPayload.items);
      setBatches(batchesPayload.items);
      if (options.setDefaultPackage && packagesPayload.items.length > 0) {
        const firstActive = packagesPayload.items.find((item) => item.status === 'active') || packagesPayload.items[0];
        setBatchForm((current) => ({ ...current, packageId: firstActive.id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取兑换码数据失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({ setDefaultPackage: true });
  }, [load]);

  async function submitPackage(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!packageForm.name.trim()) {
      setError('请填写套餐名称');
      return;
    }
    if (!Number.isInteger(packageForm.credits) || packageForm.credits < 1) {
      setError('套餐积分必须是正整数');
      return;
    }

    setIsCreatingPackage(true);
    try {
      await createRedeemPackage({
        name: packageForm.name.trim(),
        credits: packageForm.credits,
        description: packageForm.description.trim()
      });
      setPackageForm(emptyPackageForm);
      setMessage('套餐已创建');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建套餐失败');
    } finally {
      setIsCreatingPackage(false);
    }
  }

  async function togglePackage(item: RedeemPackage) {
    setError('');
    setMessage('');
    try {
      await updateRedeemPackage(item.id, {
        status: item.status === 'active' ? 'disabled' : 'active'
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新套餐失败');
    }
  }

  async function submitBatch(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setGeneratedCodes([]);
    setCopied(false);
    if (!batchForm.packageId) {
      setError('请选择套餐');
      return;
    }
    if (!Number.isInteger(batchForm.quantity) || batchForm.quantity < 1 || batchForm.quantity > 1000) {
      setError('生成数量必须在 1 到 1000 之间');
      return;
    }

    setIsCreatingBatch(true);
    try {
      const payload = await createRedeemBatch({
        packageId: batchForm.packageId,
        quantity: batchForm.quantity,
        expiresAt: batchForm.expiresAt ? new Date(batchForm.expiresAt).toISOString() : null,
        note: batchForm.note.trim()
      });
      setGeneratedCodes(payload.codes);
      setSelectedBatchId(payload.batch.id);
      setMessage('兑换码批次已生成，明文兑换码只在本次结果中显示');
      await load();
      await loadCodes(payload.batch.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成兑换码失败');
    } finally {
      setIsCreatingBatch(false);
    }
  }

  async function loadCodes(batchId: number) {
    setSelectedBatchId(batchId);
    setError('');
    try {
      const payload = await listRedeemCodesForBatch(batchId);
      setCodes(payload.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取兑换码列表失败');
    }
  }

  async function disableCode(id: number) {
    setError('');
    try {
      await disableRedeemCode(id);
      if (selectedBatchId) await loadCodes(selectedBatchId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '停用兑换码失败');
    }
  }

  async function copyGeneratedCodes() {
    if (generatedCodes.length === 0) return;
    await navigator.clipboard.writeText(generatedCodes.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="page">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>兑换码管理</h1>
        </div>
        <button className="ghostButton" type="button" disabled={isLoading} onClick={() => void load()}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {error && <div className="errorBox">{error}</div>}
      {message && <div className="hintBox">{message}</div>}

      <div className="redeemAdminGrid">
        <section className="panel formPanel">
          <div className="panelTitle">
            <h2>套餐管理</h2>
            <span>{packages.length} 个套餐</span>
          </div>
          <form className="compactStack" onSubmit={submitPackage}>
            <label className="field">
              <span>套餐名称</span>
              <input value={packageForm.name} onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })} />
            </label>
            <div className="formRow two">
              <label className="field">
                <span>积分</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={packageForm.credits}
                  onChange={(event) => setPackageForm({ ...packageForm, credits: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                <span>备注</span>
                <input value={packageForm.description} onChange={(event) => setPackageForm({ ...packageForm, description: event.target.value })} />
              </label>
            </div>
            <button className="primaryButton compact" type="submit" disabled={isCreatingPackage}>
              <Plus size={16} />
              创建套餐
            </button>
          </form>
          <div className="packageList">
            {packages.map((item) => (
              <div className="packageItem" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.credits} 积分 · {item.status === 'active' ? '启用' : '停用'}</span>
                  {item.description && <span>{item.description}</span>}
                </div>
                <button className="ghostButton" type="button" onClick={() => void togglePackage(item)}>
                  {item.status === 'active' ? '停用' : '启用'}
                </button>
              </div>
            ))}
            {packages.length === 0 && <div className="emptyLine">暂无套餐</div>}
          </div>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle">
            <h2>生成批次</h2>
            <span>最多 1000 个/批</span>
          </div>
          <form className="compactStack" onSubmit={submitBatch}>
            <label className="field">
              <span>套餐</span>
              <select
                value={batchForm.packageId}
                onChange={(event) => setBatchForm({ ...batchForm, packageId: Number(event.target.value) })}
              >
                <option value={0}>请选择套餐</option>
                {activePackages.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.credits} 积分</option>
                ))}
              </select>
            </label>
            <div className="formRow two">
              <label className="field">
                <span>数量</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={batchForm.quantity}
                  onChange={(event) => setBatchForm({ ...batchForm, quantity: Number(event.target.value) })}
                />
              </label>
              <label className="field">
                <span>过期时间</span>
                <input
                  type="datetime-local"
                  value={batchForm.expiresAt}
                  onChange={(event) => setBatchForm({ ...batchForm, expiresAt: event.target.value })}
                />
              </label>
            </div>
            <label className="field">
              <span>批次备注</span>
              <input value={batchForm.note} onChange={(event) => setBatchForm({ ...batchForm, note: event.target.value })} />
            </label>
            <button className="primaryButton compact" type="submit" disabled={isCreatingBatch || activePackages.length === 0}>
              <Ticket size={16} />
              {isCreatingBatch ? '生成中' : '生成兑换码'}
            </button>
          </form>
        </section>
      </div>

      {generatedCodes.length > 0 && (
        <section className="panel formPanel generatedCodesPanel">
          <div className="panelTitle">
            <h2>本次生成明文兑换码</h2>
            <button className="ghostButton" type="button" onClick={() => void copyGeneratedCodes()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '已复制' : '复制全部'}
            </button>
          </div>
          <textarea readOnly value={generatedCodes.join('\n')} />
        </section>
      )}

      <section className="panel tablePanel redeemBatchPanel">
        <div className="tableHeader">
          <h2>批次列表</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>批次</th>
              <th>套餐快照</th>
              <th>数量</th>
              <th>状态</th>
              <th>过期时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((item) => (
              <tr key={item.id}>
                <td><strong>#{item.id}</strong><span>{formatDate(item.createdAt)}</span></td>
                <td><strong>{item.packageNameSnapshot}</strong><span>{item.creditsSnapshot} 积分</span></td>
                <td>{item.quantity}</td>
                <td>
                  <span>可用 {item.activeCount}</span>
                  <span>已兑 {item.redeemedCount}</span>
                  <span>停用 {item.disabledCount}</span>
                </td>
                <td>{item.expiresAt ? formatDate(item.expiresAt) : '长期有效'}</td>
                <td>
                  <button className="ghostButton" type="button" onClick={() => void loadCodes(item.id)}>
                    查看兑换码
                  </button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={6}>暂无批次</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {selectedBatch && (
        <section className="panel tablePanel redeemCodePanel">
          <div className="tableHeader">
            <h2>批次 #{selectedBatch.id} 兑换码</h2>
            <span>仅显示后缀，不返回完整明文码</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>后缀</th>
                <th>积分</th>
                <th>状态</th>
                <th>兑换用户</th>
                <th>兑换时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.codeSuffix}</td>
                  <td>{item.credits}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>{item.redeemedEmail || '-'}</td>
                  <td>{item.redeemedAt ? formatDate(item.redeemedAt) : '-'}</td>
                  <td>
                    <button
                      className="dangerButton"
                      type="button"
                      disabled={item.status !== 'active'}
                      onClick={() => void disableCode(item.id)}
                    >
                      <XCircle size={14} />
                      停用
                    </button>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={7}>暂无兑换码</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function statusLabel(status: RedeemCode['status']) {
  const labels: Record<RedeemCode['status'], string> = {
    active: '可用',
    disabled: '停用',
    redeemed: '已兑换'
  };
  return labels[status];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
