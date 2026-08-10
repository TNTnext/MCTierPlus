import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button, Typography, Divider, Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import { tl } from '../../i18n';
import { GitHubIcon, GiteeIcon, GamepadIcon, LightbulbIcon } from '../icons';
import { useEscapeKey } from '../../hooks';
import { OnboardingWizard } from '../OnboardingWizard/OnboardingWizard';
import './AboutWindow.css';

const { Title, Paragraph, Text } = Typography;

interface AboutWindowProps {
  onClose: () => void;
}

/**
 * 关于软件窗口组件
 * 显示软件信息、技术栈、功能说明等
 */
export const AboutWindow: React.FC<AboutWindowProps> = ({ onClose }) => {
  useTranslation();
  const [showSponsorModal, setShowSponsorModal] = useState(false);
  const [enlargedQRCode, setEnlargedQRCode] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ESC键返回
  useEscapeKey(() => {
    // 如果有弹窗打开，先关闭弹窗
    if (enlargedQRCode) {
      setEnlargedQRCode(null);
    } else if (showSponsorModal) {
      setShowSponsorModal(false);
    } else if (showOnboarding) {
      setShowOnboarding(false);
    } else {
      // 否则关闭关于窗口
      onClose();
    }
  });

  return (
    <div className="about-window">
      {/* 顶部拖拽区域 */}
      <div className="about-window-drag-area" data-tauri-drag-region />

      <motion.div
        className="about-window-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <Title level={2} className="about-title">
            {tl('关于 MCTier', 'About MCTier')}
          </Title>
        </motion.div>

        <motion.div
          className="about-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('软件简介', 'Overview')}
            </Title>
            <Paragraph className="section-text">
              {tl(
                'MCTier 是一个把不同网络环境下的设备组到同一个虚拟局域网里的工具，支持各类可以局域网联机的游戏。它基于 EasyTier 和 WebRTC 实现，电脑和手机都能加入同一个大厅。除了联机游戏，还可以访问对方机器上本地开的网页服务；语音、聊天、文件共享和屏幕共享都是自带的，不用自己搭服务器。',
                "MCTier groups devices from different networks into one virtual LAN, and works with any game that supports LAN multiplayer. Built on EasyTier and WebRTC, both PC and mobile can join the same lobby. Besides gaming, you can also reach services running on someone else's machine. Voice, chat, file sharing and screen sharing are all built in — no server setup required."
              )}
            </Paragraph>
            <div className="game-scope-tip">
              <GamepadIcon size={24} className="game-scope-icon" />
              <Text className="game-scope-text">
                {tl(
                  '适用于任何支持局域网联机的游戏，不仅仅只有 Minecraft',
                  'Works with any game that supports LAN multiplayer, not just Minecraft'
                )}
              </Text>
            </div>
            <div className="lan-access-tip">
              <Text className="lan-access-text">
                {tl(
                  '同一大厅内的玩家可以互相访问本地开放的网站和服务（如本地Web服务器、文件共享等）',
                  "Players in the same lobby can access each other's local sites and services (local web servers, file shares, etc.)"
                )}
              </Text>
            </div>
            <Button
              type="default"
              size="middle"
              block
              onClick={() => setShowOnboarding(true)}
              className="onboarding-entry-button"
              icon={<LightbulbIcon size={16} />}
            >
              {tl('查看新手引导', 'View Getting Started')}
            </Button>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('核心技术', 'Core Technology')}
            </Title>
            <div className="tech-list">
              <div className="tech-item">
                <div>
                  <Text strong>{tl('EasyTier 虚拟网络', 'EasyTier Virtual Network')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '用 P2P 组一个虚拟局域网，跨网络也能直连',
                      'P2P-based virtual LAN, direct connections across networks'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>{tl('WebRTC 语音通信', 'WebRTC Voice')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '实时语音，延迟低，打游戏时说话不卡',
                      'Real-time voice with low latency for smooth in-game chat'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>HTTP over WireGuard</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '虚拟网络里的聊天和文件传输都走它',
                      'Carries chat and file transfer inside the virtual network'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>{tl('WebRTC 屏幕共享', 'WebRTC Screen Sharing')}</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '把屏幕实时共享出去，队友能看到你的画面',
                      'Share your screen live so teammates can see it'
                    )}
                  </Paragraph>
                </div>
              </div>
              <div className="tech-item">
                <div>
                  <Text strong>Tauri + React</Text>
                  <Paragraph className="tech-desc">
                    {tl(
                      '桌面外壳用 Tauri，体积小、启动快',
                      'Built with Tauri, so the app is small and starts fast'
                    )}
                  </Paragraph>
                </div>
              </div>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('主要功能', 'Key Features')}
            </Title>
            <ul className="feature-list">
              <li>
                {tl(
                  '虚拟局域网组网 - 基于 EasyTier 的 P2P 组网',
                  'Virtual LAN - EasyTier-based P2P networking'
                )}
              </li>
              <li>
                {tl(
                  '实时语音 - 低延迟，支持快捷键开关',
                  'Voice - low-latency, controllable with hotkeys'
                )}
              </li>
              <li>
                {tl(
                  '聊天室 - 文本和图片消息，走虚拟网络',
                  'Chat - text and images over the virtual network'
                )}
              </li>
              <li>
                {tl(
                  '文件夹共享 - HTTP 文件服务器，支持批量下载和压缩',
                  'Folder sharing - HTTP file server with batch download and compression'
                )}
              </li>
              <li>
                {tl(
                  '屏幕共享 - 实时共享，可设置访问密码',
                  'Screen sharing - live, with optional password'
                )}
              </li>
              <li>
                {tl(
                  '多节点 - 可配多个 EasyTier 节点，节点挂了自动切换',
                  'Multi-node - several EasyTier nodes with automatic failover'
                )}
              </li>
              <li>
                {tl(
                  '悬浮窗 - 打游戏时不挡视野，可调透明度和音量',
                  'Overlay - stays out of the way in-game, adjustable opacity and volume'
                )}
              </li>
              <li>
                {tl(
                  '大厅隔离 - 不同大厅互不相通，各玩各的不串线',
                  'Lobby isolation - lobbies stay separate for privacy'
                )}
              </li>
              <li>
                {tl(
                  '开机自启 - 启动时自动创建/加入大厅',
                  'Auto-start - create or join a lobby on launch'
                )}
              </li>
              <li>
                {tl(
                  '虚拟域名 - Magic DNS，用域名代替 IP',
                  'Virtual domains - Magic DNS, names instead of IPs'
                )}
              </li>
              <li>
                {tl(
                  '私有化部署 - 可以自建节点和信令服务器',
                  'Self-hosting - run your own nodes and signaling server'
                )}
              </li>
            </ul>
          </div>

          <Divider className="about-divider" />

          <div className="about-section">
            <Title level={4} className="section-title">
              {tl('开发者：青云制作_彭明航', 'Developer: QingYun Studio_PengMingHang')}
            </Title>
            <div className="developer-info">
              <Paragraph className="project-info">
                {tl(
                  '这是我开源的第三个项目，做它的初衷是让联机不用再到处找服务器、开内网穿透。',
                  'This is my third open-source project. It started because I wanted LAN gaming without hunting for servers or messing with port forwarding.'
                )}
              </Paragraph>
              <div className="repo-links">
                <a
                  href="https://mctier.pmhs.top"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-link"
                >
                  <img src="/MCTierIcon.png" alt="MCTier" className="mctier-icon" />
                  <span>{tl('MCTier 官网', 'MCTier Website')}</span>
                </a>
                <a
                  href="https://github.com/pmh1314520/MCTier"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-link"
                >
                  <GitHubIcon size={16} />
                  <span>{tl('GitHub 开源仓库', 'GitHub Repository')}</span>
                </a>
                <a
                  href="https://gitee.com/peng-minghang/mctier"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="repo-link"
                >
                  <GiteeIcon size={16} />
                  <span>{tl('Gitee 开源仓库', 'Gitee Repository')}</span>
                </a>
              </div>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section license-section">
            <Title level={4} className="section-title">
              {tl('开源协议', 'License')}
            </Title>
            <div className="license-content">
              <Paragraph className="license-text">
                {tl(
                  '本软件采用自定义开源协议，使用前请仔细阅读：',
                  'This software uses a custom open-source license. Please read carefully before use:'
                )}
              </Paragraph>
              <ul className="license-list">
                <li className="license-item">
                  <span className="license-icon">✗</span>
                  <Text className="license-desc">
                    {tl(
                      '禁止商业用途 - 本软件仅供个人学习和非商业使用',
                      'No commercial use - for personal learning and non-commercial use only'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✓</span>
                  <Text className="license-desc">
                    {tl(
                      '允许二次开发 - 欢迎基于本项目进行修改和扩展',
                      'Modification allowed - feel free to modify and extend this project'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✎</span>
                  <Text className="license-desc">
                    {tl(
                      '必须标明原作者 - 二次开发项目需注明原作者信息',
                      'Attribution required - derivative projects must credit the original author'
                    )}
                  </Text>
                </li>
                <li className="license-item">
                  <span className="license-icon">✓</span>
                  <Text className="license-desc">
                    {tl(
                      '二次开发必须开源 - 衍生项目必须以相同协议开源',
                      'Derivatives must be open source under the same license'
                    )}
                  </Text>
                </li>
              </ul>
              <Paragraph className="license-note">
                {tl(
                  '使用本软件即表示您同意遵守以上协议条款',
                  'By using this software you agree to the terms above'
                )}
              </Paragraph>
            </div>
          </div>

          <Divider className="about-divider" />

          <div className="about-section sponsor-section">
            <Title level={4} className="section-title">
              {tl('支持开发者', 'Support the Developer')}
            </Title>
            <Paragraph className="sponsor-text">
              {tl(
                '如果这个软件对您有帮助，欢迎请开发者喝杯咖啡',
                'If this software helps you, feel free to buy the developer a coffee'
              )}
            </Paragraph>
            <Button
              type="default"
              size="middle"
              block
              onClick={() => setShowSponsorModal(true)}
              className="sponsor-button"
            >
              {tl('赞助支持', 'Sponsor')}
            </Button>
          </div>

          <Divider className="about-divider" />

          <div className="about-section blessing-section">
            <div className="blessing-text">
              <Text className="blessing-content">
                {tl(
                  '祝各位玩家游玩愉快，享受与好友联机的快乐时光！',
                  'Wishing everyone happy gaming and great times with friends!'
                )}
              </Text>
            </div>
            <Paragraph className="free-text">
              {tl('本软件完全免费开源', 'Completely free and open source')}
            </Paragraph>
          </div>
        </motion.div>

        <motion.div
          className="about-actions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <Button type="primary" size="large" block onClick={onClose} className="close-button">
            {tl('返回', 'Back')}
          </Button>
        </motion.div>
      </motion.div>

      {/* 新手引导向导 */}
      <OnboardingWizard visible={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* 赞助弹窗 */}
      <Modal
        open={showSponsorModal}
        onCancel={() => setShowSponsorModal(false)}
        footer={null}
        centered
        width={420}
        className="sponsor-modal"
      >
        <div className="sponsor-modal-content">
          <Title level={3} className="sponsor-modal-title">
            {tl('感谢您的支持', 'Thank You for Your Support')}
          </Title>
          <Paragraph className="sponsor-modal-desc">
            {tl('您的支持是我持续开发的动力！', 'Your support keeps me developing!')}
          </Paragraph>
          <div className="qrcode-container">
            <div className="qrcode-item" onClick={() => setEnlargedQRCode('/zfb.jpg')}>
              <img src="/zfb.jpg" alt="Alipay" className="qrcode-image" />
              <Text className="qrcode-label">{tl('支付宝', 'Alipay')}</Text>
            </div>
            <div className="qrcode-item" onClick={() => setEnlargedQRCode('/wx.png')}>
              <img src="/wx.png" alt="WeChat" className="qrcode-image" />
              <Text className="qrcode-label">{tl('微信', 'WeChat')}</Text>
            </div>
          </div>
        </div>
      </Modal>

      {/* 二维码放大弹窗 */}
      <Modal
        open={!!enlargedQRCode}
        onCancel={() => setEnlargedQRCode(null)}
        footer={null}
        centered
        width="auto"
        className="qrcode-enlarged-modal"
        styles={{
          body: { padding: 0 },
        }}
      >
        {enlargedQRCode && (
          <img
            src={enlargedQRCode}
            alt="QR Code"
            className="qrcode-enlarged-image"
            onClick={() => setEnlargedQRCode(null)}
          />
        )}
      </Modal>
    </div>
  );
};
